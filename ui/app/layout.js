import './globals.css';

export const metadata = {
  title: 'Career-Ops Dashboard',
  description: 'Browse roles, boards, and targeting for your job search',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
