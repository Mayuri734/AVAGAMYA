import asyncio


async def send_risk_alert_email(recipient: str, document_name: str, high_risk_count: int, max_score: float):
    """
    Mock service to simulate sending a high-risk alert email.
    In a real production environment, this would use Resend, SendGrid, or AWS SES.
    """
    await asyncio.sleep(2)  # Simulate network delay
    print("\n" + "="*50)
    print("🚨 CRITICAL RISK ALERT SENT 🚨")
    print(f"To: {recipient}")
    print(f"Subject: URGENT: High Risk Detected in {document_name}")
    print(f"Body: AVAGAMYA detected {high_risk_count} critical risk clauses.")
    print(f"Highest Risk Score: {max_score}/100")
    print("Please log in to the Compliance Officer Dashboard to review immediately.")
    print("="*50 + "\n")
