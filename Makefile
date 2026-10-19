PY := backend/.venv/bin/python
REPOS := django/django pallets/flask psf/requests scikit-learn/scikit-learn sympy/sympy \
         matplotlib/matplotlib pytest-dev/pytest psf/black encode/httpx fastapi/fastapi \
         celery/celery scrapy/scrapy pandas-dev/pandas home-assistant/core

.PHONY: setup data train test api web dev

setup:            ## create the Python venv and install frontend deps
	python3.12 -m venv backend/.venv
	$(PY) -m pip install -r backend/requirements.txt
	cd frontend && npm install

data:             ## clone source repos (blobless) and build data/dataset.csv
	mkdir -p backend/data/repos
	cd backend/data/repos && for r in $(REPOS); do n=$$(basename $$r); \
	  [ -d $$n ] || git clone -q --filter=blob:none --no-checkout https://github.com/$$r.git $$n; done
	cd backend && .venv/bin/python -m ml.build_dataset

train:            ## grid-search + evaluate all four models, write artifacts/ and docs/figures/
	cd backend && .venv/bin/python -m ml.train

test:
	cd backend && .venv/bin/python -m pytest -q

api:              ## FastAPI on :8000
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

web:              ## Next.js on :3000
	cd frontend && npm run dev

dev:              ## run API and web together
	$(MAKE) -j2 api web
