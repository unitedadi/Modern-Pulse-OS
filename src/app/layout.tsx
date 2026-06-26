import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Google_Sans_Flex } from "next/font/google";
import "./globals.css";

const googleSansFlex = Google_Sans_Flex({
  variable: "--font-google-sans-flex",
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz", "GRAD", "ROND", "wdth"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Modern Pulse OS",
  description:
    "A modern operating layer for B2B healthcare partners, bookings, analytics, and fulfillment.",
};

const clerkPublishableKey =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
  "pk_test_cXVhbGl0eS1yb2RlbnQtMzQuY2xlcmsuYWNjb3VudHMuZGV2JA";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <html lang="en" className={`${googleSansFlex.variable} h-full`}>
        <body className="flex min-h-full flex-col antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
