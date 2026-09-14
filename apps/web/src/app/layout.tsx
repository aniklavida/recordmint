import "./globals.css";

export const metadata = {
  title: "RecordMint",
  description: "Record in the browser. Share a link. Own the file.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
