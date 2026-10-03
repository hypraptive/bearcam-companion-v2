export function Footer(): React.JSX.Element {
  return (
    <footer className="border-t bg-background py-6">
      <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
        BearCam Companion — webcam images courtesy of{' '}
        <a
          href="https://explore.org"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          explore.org
        </a>
      </div>
    </footer>
  );
}
