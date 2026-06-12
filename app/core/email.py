import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings


def send_email(to_email: str, subject: str, html_body: str) -> bool:
    if not settings.SMTP_EMAIL or not settings.SMTP_APP_PASSWORD:
        print("WARNING: SMTP not configured, skipping email send")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_EMAIL}>"
        msg["To"]      = to_email
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(settings.SMTP_EMAIL, settings.SMTP_APP_PASSWORD)
            server.sendmail(settings.SMTP_EMAIL, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f"Email send error: {e}")
        return False


def send_password_reset_email(to_email: str, username: str, reset_url: str) -> bool:
    subject = "Password Reset — Finance Manager"
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem">
      <h2 style="color:#111827">Password Reset Request</h2>
      <p style="color:#6b7280">Hi <strong>{username}</strong>,</p>
      <p style="color:#6b7280">
        We received a request to reset your Finance Manager password.
        Click the button below to set a new password.
      </p>
      <div style="text-align:center;margin:2rem 0">
        <a href="{reset_url}"
          style="background:#4f46e5;color:#fff;padding:0.75rem 2rem;
          border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
          Reset Password
        </a>
      </div>
      <p style="color:#9ca3af;font-size:0.82rem">
        This link expires in <strong>30 minutes</strong>.<br>
        If you didn't request this, ignore this email.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:1.5rem 0">
      <p style="color:#9ca3af;font-size:0.75rem">Finance Manager — Daily Finance System</p>
    </div>
    """
    return send_email(to_email, subject, html)