import os
import smtplib
import logging
from email.mime.text import MIMEText

_log = logging.getLogger(__name__)

GMAIL_USER         = os.getenv("GMAIL_USER", "")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")
ADMIN_EMAIL        = os.getenv("ADMIN_EMAIL", "")
APP_URL            = os.getenv("APP_URL", "https://swing-trainer.up.railway.app")


def _send(to: str, subject: str, body: str) -> None:
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        _log.warning("Email not configured — skipping send to %s", to)
        return
    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"]    = GMAIL_USER
        msg["To"]      = to
        with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
            smtp.starttls()
            smtp.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            smtp.sendmail(GMAIL_USER, to, msg.as_string())
    except Exception:
        _log.exception("Failed to send email to %s", to)


def send_access_request_notification(requester_email: str, requester_name: str) -> None:
    if not ADMIN_EMAIL:
        _log.warning("ADMIN_EMAIL not set — skipping access request notification")
        return
    _send(
        to=ADMIN_EMAIL,
        subject=f"SwingTrainer: New access request from {requester_name or requester_email}",
        body=(
            f"New access request:\n\n"
            f"Email: {requester_email}\n"
            f"Name:  {requester_name or '(not provided)'}\n\n"
            f"Log in to approve or reject:\n{APP_URL}/admin"
        ),
    )


def send_approval_notification(requester_email: str) -> None:
    _send(
        to=requester_email,
        subject="SwingTrainer: Your access has been approved",
        body=(
            f"Your access to SwingTrainer has been approved!\n\n"
            f"Sign in here: {APP_URL}\n\n"
            f"Complete your profile on first login."
        ),
    )
