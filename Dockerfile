FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY fb fb
CMD ["uvicorn", "fb.main:app", "--host", "0.0.0.0", "--port", "8000"]
