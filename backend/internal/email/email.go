package email

import (
	"fmt"
	"os"

	"gopkg.in/gomail.v2"
)

// SendOTP sends an OTP to the specified email address using gomail.
func SendOTP(name, email, otp string) error {
	// Get email configuration from environment variables
	smtpHost := os.Getenv("SMTP_HOST")
	smtpPort := 587 // Standard port for SMTP with STARTTLS
	senderEmail := os.Getenv("SMTP_USER")
	senderPassword := os.Getenv("SMTP_PASS")

	if smtpHost == "" || senderEmail == "" || senderPassword == "" {
		return fmt.Errorf("SMTP configuration is missing. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables")
	}

	userName := name
	if userName == "" {
		userName = "User"
	}

	m := gomail.NewMessage()
	m.SetHeader("From", senderEmail)
	m.SetHeader("To", email)
	m.SetHeader("Subject", "Your OTP for File Vault")
	m.SetBody("text/html", fmt.Sprintf(`Hi %s,<br><br>You requested to verify your email address for the File Vault application.<br><br>🔑 Your One-Time Password (OTP) is: <b>%s</b><br>⏳ This code will expire in 15 minutes.<br><br>⚠️ For your security:<br>- Do not share this OTP with anyone.<br>- We will never ask for your OTP over phone, email, or chat.<br><br>If you did not request this verification, please ignore this email or contact support immediately.<br><br>Thanks,<br>The File Vault Team`, userName, otp))

	// The port is an int, so we need to convert it from the string if we were getting it from env
	d := gomail.NewDialer(smtpHost, smtpPort, senderEmail, senderPassword)

	// Send the email
	if err := d.DialAndSend(m); err != nil {
		return fmt.Errorf("could not send email: %w", err)
	}

	return nil
}
