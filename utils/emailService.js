const nodemailer = require("nodemailer");

const normalize = (value) => String(value || "").trim();
const SMTP_TIMEOUT_MS = Number(process.env.SMTP_TIMEOUT_MS || 10000);

const getSmtpConfig = () => {
  const user = normalize(process.env.SMTP_USER);
  const pass = normalize(process.env.SMTP_PASS).replace(/\s+/g, "");

  if (!user || !pass) {
    throw new Error("SMTP_USER or SMTP_PASS is missing.");
  }

  const host = normalize(process.env.SMTP_HOST) || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";
  const appName = normalize(process.env.SMTP_APP_NAME) || "sbtexam";

  return { host, port, secure, user, pass, appName };
};

const getTransporter = () => {
  const cfg = getSmtpConfig();
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
  });
};

const sendEmail = async ({ to, subject, html }) => {
  const cfg = getSmtpConfig();
  const transporter = getTransporter();

  try {
    await transporter.sendMail({
      from: `"${cfg.appName}" <${cfg.user}>`,
      to,
      subject,
      html,
    });
  } catch (error) {
    const wrappedError = new Error(
      "Unable to send email right now. Please check SMTP settings and try again."
    );
    wrappedError.name = "EmailDeliveryError";
    wrappedError.cause = error;
    throw wrappedError;
  }
};

const sendVerificationEmail = async ({ to, name, otp }) => {
  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.5;">
      <h2>Email Verification OTP</h2>
      <p>Hi ${name || "Learner"},</p>
      <p>Your OTP is:</p>
      <h1 style="letter-spacing:3px;">${otp}</h1>
      <p>This OTP expires in 5 minutes.</p>
    </div>
  `;
  await sendEmail({ to, subject: "Your verification OTP", html });
};

const sendPasswordResetEmail = async ({ to, name, otp }) => {
  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.5;">
      <h2>Password Reset OTP</h2>
      <p>Hi ${name || "Learner"},</p>
      <p>Your password reset OTP is:</p>
      <h1 style="letter-spacing:3px;">${otp}</h1>
      <p>This OTP expires in 5 minutes.</p>
    </div>
  `;
  await sendEmail({ to, subject: "Your password reset OTP", html });
};

const toIstString = (dateInput) => {
  const date = new Date(dateInput);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
};

const sendPrivateExamAssignedEmail = async ({
  to,
  name,
  examTitle,
  startTime,
  endTime,
  examLink,
}) => {
  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.6;">
      <h2>Private Exam Assigned</h2>
      <p>Hi ${name || "Learner"},</p>
      <p>You have been assigned a private exam.</p>
      <p><strong>Exam:</strong> ${examTitle}</p>
      <p><strong>Start Time (IST):</strong> ${toIstString(startTime)}</p>
      <p><strong>End Time (IST):</strong> ${toIstString(endTime)}</p>
      <p><a href="${examLink}" target="_blank" rel="noopener noreferrer">Open Exam</a></p>
      <p>Please complete the exam only within the above time window.</p>
    </div>
  `;
  await sendEmail({ to, subject: `Private Exam Assigned: ${examTitle}`, html });
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPrivateExamAssignedEmail,
};
