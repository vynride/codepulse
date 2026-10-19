// A realistic legacy billing module: god functions, deep nesting, long parameter
// lists, broad excepts, module globals and copy-pasted branches.
export const GNARLY = `import os
import sys
import json
import csv
import time
import logging
import smtplib
import datetime
from email.mime.text import MIMEText

import requests

from billing import db
from billing.models import Order, Customer, Invoice, LineItem, Coupon
from billing.tax import TAX_TABLE
from billing import settings

log = logging.getLogger("billing")

CACHE = {}
RATES = None
LAST_SYNC = 0
FAILED = []
DRY_RUN = os.environ.get("BILLING_DRY_RUN") == "1"
SMTP_HOST = "mail.internal"
CURRENCY_API = "https://fx.internal/api/rates"


def load_rates(force=False):
    global RATES, LAST_SYNC
    if RATES is not None and not force and time.time() - LAST_SYNC < 3600:
        return RATES
    try:
        r = requests.get(CURRENCY_API, timeout=5)
        if r.status_code == 200:
            RATES = r.json()
            LAST_SYNC = time.time()
        else:
            if RATES is None:
                RATES = json.load(open(settings.FALLBACK_RATES))
    except:
        if RATES is None:
            try:
                RATES = json.load(open(settings.FALLBACK_RATES))
            except:
                RATES = {"USD": 1.0}
    return RATES


def convert(amount, frm, to):
    rates = load_rates()
    if frm == to:
        return amount
    if frm not in rates or to not in rates:
        log.warning("missing rate %s %s", frm, to)
        return amount
    return amount / rates[frm] * rates[to]


def calc_shipping(order, customer, items, region, express, weight_override=None, promo=None, warehouse=None):
    total_weight = 0
    for it in items:
        if it.weight:
            total_weight += it.weight * it.qty
        else:
            total_weight += 0.5 * it.qty
    if weight_override:
        total_weight = weight_override
    cost = 0
    if region == "US":
        if total_weight < 1:
            cost = 4.99
        elif total_weight < 5:
            cost = 9.99
        elif total_weight < 20:
            cost = 19.99
        else:
            cost = 19.99 + (total_weight - 20) * 0.75
        if express:
            cost = cost * 2
        if customer.tier == "gold":
            cost = 0
        elif customer.tier == "silver" and order.subtotal > 50:
            cost = cost / 2
    elif region == "EU":
        if total_weight < 1:
            cost = 6.99
        elif total_weight < 5:
            cost = 12.99
        elif total_weight < 20:
            cost = 24.99
        else:
            cost = 24.99 + (total_weight - 20) * 0.95
        if express:
            cost = cost * 2
        if customer.tier == "gold":
            cost = 0
        elif customer.tier == "silver" and order.subtotal > 60:
            cost = cost / 2
    elif region == "UK":
        if total_weight < 1:
            cost = 5.99
        elif total_weight < 5:
            cost = 11.99
        elif total_weight < 20:
            cost = 22.99
        else:
            cost = 22.99 + (total_weight - 20) * 0.9
        if express:
            cost = cost * 2.5
        if customer.tier == "gold":
            cost = 0
        elif customer.tier == "silver" and order.subtotal > 55:
            cost = cost / 2
    else:
        if total_weight < 5:
            cost = 29.99
        else:
            cost = 29.99 + total_weight * 1.5
        if express:
            cost = cost * 3
    if promo and promo.free_shipping:
        if promo.min_total is None or order.subtotal >= promo.min_total:
            cost = 0
    if warehouse and warehouse.region != region:
        cost += 7.5
    return round(cost, 2)


def apply_coupon(order, coupon, items, customer, now, strict=True, allow_stack=False):
    if coupon is None:
        return 0
    if coupon.expires and coupon.expires < now:
        if strict:
            raise ValueError("coupon expired")
        return 0
    if coupon.max_uses and coupon.used >= coupon.max_uses:
        if strict:
            raise ValueError("coupon used up")
        return 0
    if coupon.customer_id and coupon.customer_id != customer.id:
        return 0
    discount = 0
    if coupon.kind == "percent":
        for it in items:
            if coupon.category is None or it.category == coupon.category:
                if not it.on_sale or allow_stack:
                    discount += it.price * it.qty * coupon.value / 100
    elif coupon.kind == "fixed":
        discount = coupon.value
        if discount > order.subtotal:
            discount = order.subtotal
    elif coupon.kind == "bogo":
        for it in items:
            if it.category == coupon.category:
                if it.qty >= 2:
                    discount += (it.qty // 2) * it.price
    else:
        log.error("unknown coupon kind %s", coupon.kind)
    return round(discount, 2)


def process_order(order_id, user, notify=True, currency=None, express=False, coupon_code=None, retry=0, dry_run=None):
    global FAILED, CACHE
    if dry_run is None:
        dry_run = DRY_RUN
    order = CACHE.get(order_id)
    if order is None:
        order = db.get(Order, order_id)
        if order is None:
            log.error("order %s not found", order_id)
            return None
        CACHE[order_id] = order
    customer = db.get(Customer, order.customer_id)
    items = db.query(LineItem, order_id=order.id)
    if not items:
        log.warning("empty order %s", order_id)
        return None
    if order.status == "paid" or order.status == "shipped":
        return order
    if order.status == "cancelled":
        if user.is_admin:
            order.status = "pending"
        else:
            return None
    subtotal = 0
    for it in items:
        if it.qty <= 0:
            continue
        if it.price is None:
            try:
                it.price = db.lookup_price(it.sku)
            except Exception as e:
                log.error("no price for %s: %s", it.sku, e)
                FAILED.append(order_id)
                return None
        if it.on_sale:
            if it.sale_price is not None and it.sale_price < it.price:
                if customer.tier == "gold":
                    if it.category in settings.GOLD_EXTRA_CATEGORIES:
                        if it.qty >= settings.GOLD_BULK_QTY:
                            subtotal += it.sale_price * it.qty * 0.9
                        else:
                            subtotal += it.sale_price * it.qty * 0.95
                    else:
                        subtotal += it.sale_price * it.qty
                else:
                    subtotal += it.sale_price * it.qty
            else:
                subtotal += it.price * it.qty
        else:
            subtotal += it.price * it.qty
    order.subtotal = subtotal
    coupon = None
    if coupon_code:
        coupon = db.first(Coupon, code=coupon_code)
        if coupon is None:
            log.info("bad coupon %s", coupon_code)
    try:
        discount = apply_coupon(order, coupon, items, customer, datetime.datetime.now())
    except ValueError as e:
        if user.is_admin:
            discount = 0
        else:
            raise
    region = customer.region or "US"
    shipping = calc_shipping(order, customer, items, region, express)
    tax = 0
    if region in TAX_TABLE:
        rate = TAX_TABLE[region]
        if customer.tax_exempt:
            tax = 0
        else:
            if region == "US":
                if customer.state in rate:
                    tax = (subtotal - discount) * rate[customer.state]
                else:
                    tax = (subtotal - discount) * rate.get("default", 0)
            else:
                tax = (subtotal - discount + shipping) * rate["vat"]
    total = subtotal - discount + shipping + tax
    if currency and currency != order.currency:
        total = convert(total, order.currency, currency)
        order.currency = currency
    order.total = round(total, 2)
    if order.total < 0:
        order.total = 0
    if dry_run:
        print("DRY RUN", order_id, order.total)
        return order
    invoice = Invoice(order_id=order.id, amount=order.total, currency=order.currency)
    try:
        resp = requests.post(
            settings.PAYMENT_URL,
            json={"amount": order.total, "currency": order.currency, "token": customer.payment_token},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "ok":
                if order.total > settings.FRAUD_LIMIT:
                    if not customer.verified:
                        if not user.is_admin:
                            order.status = "on_hold"
                            invoice.status = "pending"
                        else:
                            order.status = "paid"
                            invoice.status = "paid"
                    else:
                        order.status = "paid"
                        invoice.status = "paid"
                else:
                    order.status = "paid"
                    invoice.status = "paid"
                invoice.ref = data.get("ref")
            elif data.get("status") == "pending":
                order.status = "pending_payment"
                invoice.status = "pending"
            else:
                order.status = "failed"
                invoice.status = "failed"
                FAILED.append(order_id)
        elif resp.status_code >= 500:
            if retry < 3:
                time.sleep(2 ** retry)
                return process_order(order_id, user, notify, currency, express, coupon_code, retry + 1, dry_run)
            else:
                order.status = "failed"
                FAILED.append(order_id)
        else:
            order.status = "failed"
            FAILED.append(order_id)
    except Exception as e:
        log.exception("payment error")
        if retry < 3:
            return process_order(order_id, user, notify, currency, express, coupon_code, retry + 1, dry_run)
        order.status = "failed"
        FAILED.append(order_id)
    try:
        db.save(order)
        db.save(invoice)
        if coupon and order.status == "paid":
            coupon.used += 1
            db.save(coupon)
    except:
        log.error("could not save order %s", order_id)
    if notify:
        try:
            if order.status == "paid":
                send_mail(customer.email, "Your order %s" % order.id, "Thanks! Total: %.2f %s" % (order.total, order.currency))
            elif order.status == "failed":
                send_mail(customer.email, "Payment problem", "We could not charge your card for order %s" % order.id)
                send_mail(settings.OPS_EMAIL, "Payment failed", "order %s user %s" % (order.id, user.id))
            elif order.status == "pending_payment":
                send_mail(customer.email, "Payment pending", "Your payment for %s is pending" % order.id)
        except:
            pass
    if order_id in CACHE:
        del CACHE[order_id]
    return order


def send_mail(to, subject, body):
    if DRY_RUN:
        print("MAIL", to, subject)
        return
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = settings.FROM_EMAIL
    msg["To"] = to
    try:
        s = smtplib.SMTP(SMTP_HOST)
        s.sendmail(settings.FROM_EMAIL, [to], msg.as_string())
        s.quit()
    except Exception as e:
        log.error("mail failed %s", e)


def export_invoices(path, start, end, region=None, status=None, fmt="csv", include_tax=True, user=None):
    rows = []
    for inv in db.query(Invoice):
        if inv.created < start or inv.created > end:
            continue
        order = db.get(Order, inv.order_id)
        if order is None:
            continue
        customer = db.get(Customer, order.customer_id)
        if region and customer.region != region:
            continue
        if status and inv.status != status:
            continue
        row = {"invoice": inv.id, "order": order.id, "customer": customer.email, "amount": inv.amount, "currency": inv.currency}
        if include_tax:
            try:
                row["tax"] = round(inv.amount - order.subtotal - (order.shipping or 0), 2)
            except:
                row["tax"] = ""
        if user and not user.is_admin:
            row["customer"] = row["customer"][:3] + "***"
        rows.append(row)
    if fmt == "csv":
        with open(path, "w") as f:
            w = csv.DictWriter(f, fieldnames=rows[0].keys() if rows else ["invoice"])
            w.writeheader()
            w.writerows(rows)
    elif fmt == "json":
        with open(path, "w") as f:
            json.dump(rows, f, default=str)
    else:
        raise ValueError("bad format " + fmt)
    return len(rows)


def refund_order(order_id, user, amount=None, reason="", partial=False, restock=True, notify=True, force=False):
    order = db.get(Order, order_id)
    if order is None:
        return None
    if order.status not in ("paid", "shipped", "partially_refunded"):
        if not force:
            return None
    customer = db.get(Customer, order.customer_id)
    invoice = db.first(Invoice, order_id=order.id)
    if amount is None:
        amount = order.total
    if amount > order.total:
        if user.is_admin and force:
            log.warning("refund %s exceeds total for %s", amount, order_id)
        else:
            amount = order.total
    items = db.query(LineItem, order_id=order.id)
    if restock:
        for it in items:
            try:
                if it.sku.startswith("DIGI-"):
                    continue
                stock = db.lookup_stock(it.sku)
                if stock is not None:
                    db.set_stock(it.sku, stock + it.qty)
            except:
                log.error("restock failed %s", it.sku)
    try:
        resp = requests.post(
            settings.PAYMENT_URL + "/refund",
            json={"ref": invoice.ref if invoice else None, "amount": amount, "currency": order.currency},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "ok":
                if partial or amount < order.total:
                    order.status = "partially_refunded"
                else:
                    order.status = "refunded"
                if invoice:
                    invoice.status = order.status
            else:
                order.status = "refund_failed"
                FAILED.append(order_id)
        else:
            order.status = "refund_failed"
            FAILED.append(order_id)
    except Exception as e:
        log.exception("refund error")
        order.status = "refund_failed"
        FAILED.append(order_id)
    try:
        db.save(order)
        if invoice:
            db.save(invoice)
    except:
        log.error("could not save refund %s", order_id)
    if notify:
        try:
            if order.status == "refunded":
                send_mail(customer.email, "Refund for order %s" % order.id, "We refunded %.2f %s. %s" % (amount, order.currency, reason))
            elif order.status == "partially_refunded":
                send_mail(customer.email, "Partial refund for order %s" % order.id, "We refunded %.2f %s. %s" % (amount, order.currency, reason))
            elif order.status == "refund_failed":
                send_mail(settings.OPS_EMAIL, "Refund failed", "order %s user %s amount %s" % (order.id, user.id, amount))
        except:
            pass
    return order


def retry_failed(user):
    global FAILED
    done = []
    for oid in list(FAILED):
        o = process_order(oid, user, notify=False)
        if o is not None and o.status == "paid":
            done.append(oid)
    FAILED = [x for x in FAILED if x not in done]
    return done

`;
