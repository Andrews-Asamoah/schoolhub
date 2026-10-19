import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Round profile picture with an initial as the fallback (no image, or it failed to load). */
export function UserAvatar({
  name,
  image,
  className,
}: {
  name?: string | null;
  image?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100",
        className ?? "size-8",
      )}
    >
      {image && !failed ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        (name?.trim().charAt(0).toUpperCase() || "S")
      )}
    </span>
  );
}
