import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Header() {
  return (
    <div className="flex flex-col gap-16 items-center">
      <h1 className="text-4xl font-bold text-center">Framed</h1>
      <p className="text-xl lg:text-2xl !leading-tight mx-auto max-w-xl text-center text-muted-foreground">
        A social deduction game where the impostor doesn’t know they’re lying.
      </p>
      <Button asChild className="w-full max-w-xs">
        <Link href="/game-hub">
          Enter Game Hub
        </Link>
      </Button>
      <div className="w-full p-[1px] bg-gradient-to-r from-transparent via-foreground/10 to-transparent my-8" />
    </div>
  );
}
