export function Wordmark({ animated = false }: { animated?: boolean }) {
  return (
    <>
      <img
        className="wordmark-logo"
        src={`${import.meta.env.BASE_URL}${animated ? 'dog-eared-logo-animated.svg' : 'dog-eared-logo.svg'}`}
        width="48"
        height="28"
        alt=""
        aria-hidden="true"
        decoding="async"
      />
      <span className="wordmark-text">
        dog<span className="wordmark-hyphen">&#8208;</span>eared
        <span className="wordmark-dot">.</span>
      </span>
    </>
  );
}
