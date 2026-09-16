import "./globals.css";

export const metadata = {
  title: "Ads Earn",
  description: "Watch ads and earn rewards"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
