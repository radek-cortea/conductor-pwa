export function AppBrand() {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 font-semibold whitespace-nowrap">
      <img
        src={`${import.meta.env.BASE_URL}favicon.svg`}
        alt=""
        width={28}
        height={28}
        className="size-7"
      />
      Conductor PWA
    </span>
  );
}
