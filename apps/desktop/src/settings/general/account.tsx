import type { ReactNode } from "react";

export function AccountSettings() {
  return (
    <div className="flex flex-col gap-4">
      <Container
        title="Your Account"
        description="Local-only mode. No cloud account required."
      />
    </div>
  );
}

function Container({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg bg-neutral-50 p-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-md font-serif font-semibold">{title}</h1>
        {description && (
          <p className="text-sm text-neutral-600">{description}</p>
        )}
      </div>
      {action ? <div>{action}</div> : null}
      {children}
    </section>
  );
}
