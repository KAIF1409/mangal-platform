import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page Not Found",
};

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#07070a",
        color: "#f9fafb",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          fontSize: "13px",
          fontWeight: 700,
          letterSpacing: "0.12em",
          color: "#9ca3af",
          textTransform: "uppercase",
          marginBottom: "12px",
        }}
      >
        MANGAL
      </div>
      <div
        style={{
          fontSize: "84px",
          fontWeight: 800,
          lineHeight: 1,
          background: "linear-gradient(135deg, #f9fafb, #6b7280)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        404
      </div>
      <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "16px 0 8px" }}>
        This page doesn&apos;t exist
      </h1>
      <p style={{ fontSize: "14px", color: "#9ca3af", maxWidth: "420px", margin: "0 0 28px" }}>
        The chapter, series or page you&apos;re looking for may have been moved,
        renamed, or removed by its creator.
      </p>
      <Link
        href="/"
        style={{
          padding: "12px 28px",
          borderRadius: "10px",
          background: "linear-gradient(135deg, #7f1d1d, #991b1b)",
          color: "#fff",
          textDecoration: "none",
          fontSize: "14px",
          fontWeight: 600,
        }}
      >
        Back to MANGAL
      </Link>
    </div>
  );
}
