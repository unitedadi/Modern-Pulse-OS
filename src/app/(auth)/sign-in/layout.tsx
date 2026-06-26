export default function SignInLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main className="pls-auth-shell">{children}</main>;
}
