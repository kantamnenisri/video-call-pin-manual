FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Using eventlet worker class for SocketIO compatibility
CMD ["gunicorn", "--worker-class", "eventlet", "-w", "1", "-b", "0.0.0.0:8000", "app:app"]