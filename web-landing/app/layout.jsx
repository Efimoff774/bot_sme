export const metadata = {
  title: 'SME Digest',
  description: 'Monthly SME team digest'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont' }}>
        {children}
      </body>
    </html>
  );
}

