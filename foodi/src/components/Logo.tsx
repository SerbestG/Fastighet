export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="logo" style={{ fontSize: size }} role="img" aria-label="Foodi">
      <span aria-hidden="true">Foo</span>
      <span className="logo__di" aria-hidden="true">
        di
        <svg className="logo__smile" viewBox="0 0 44 14" aria-hidden="true">
          <path d="M4 3.5 Q22 17 40 3.5" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
        </svg>
      </span>
    </span>
  );
}
