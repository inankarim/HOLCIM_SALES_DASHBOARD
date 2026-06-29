import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Gmail App Password (not your real password)
  },
});

export const verifyEmailConnection = async () => {
  try {
    await transporter.verify();
    console.log("✅ Email server connected");
  } catch (err) {
    console.error("❌ Email server connection failed:", err);
  }
};
