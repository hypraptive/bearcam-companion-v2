import Link from 'next/link';

export function Nav(): React.JSX.Element {
  return (
    <header className="border-b bg-background">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold">
          BearCam Companion
        </Link>
        <nav className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Login
          </Link>
        </nav>
      </div>
    </header>
  );
}
