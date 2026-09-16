import Script from "next/script";
import "./globals.css";

export const metadata = {
  title: "Ads Earn",
  description: "Watch ads and earn rewards"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}

        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
