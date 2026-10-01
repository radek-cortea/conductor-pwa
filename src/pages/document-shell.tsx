import { HeadContent, Outlet } from "@tanstack/react-router";

export function RootDocument() {
  return (
    <>
      <HeadContent />
      <Outlet />
    </>
  );
}

export function IndexRedirect() {
  return null;
}
