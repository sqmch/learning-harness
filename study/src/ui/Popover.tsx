/* ── popovers ──────────────────────────────────────────────────────────────
   The terminal's preferences panel was `{open && <Panel/>}` rendered inline: no
   portal (so it could be clipped by the pane it lived in), no outside-click or
   Escape dismissal, no focus return to the gear, and no collision handling near
   the window edge. Radix supplies all of that; the caller keeps owning `open`,
   because the study's panes already reason about whether the panel is showing. */

import * as RP from "@radix-ui/react-popover";
import type { ReactElement, ReactNode } from "react";
import { TipSurface, TooltipRoot, TooltipTrigger, tipTrigger, type TipPlacement } from "./Tooltip";

export function Popover(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The control that toggles it — rendered as-is, so it keeps its own class,
   *  aria-label, and handlers. */
  trigger: ReactElement;
  /** A tooltip for that same control. It has to be declared here rather than
   *  wrapped around the trigger by the caller: both wrappers hand their child
   *  to Radix with `asChild`, so <Tooltip><button/></Tooltip> passed as
   *  `trigger` would clone onto the Tooltip *component* — dropping its props
   *  and warning on the ref. Nesting the two Triggers directly is the only
   *  composition Radix supports, and it belongs behind the API rather than in
   *  every caller. */
  tooltip?: ReactNode;
  tooltipPlacement?: TipPlacement;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const { open, onOpenChange, trigger, tooltip, children, side = "bottom", align = "end" } = props;

  const control = <RP.Trigger asChild>{tipTrigger(trigger)}</RP.Trigger>;

  return (
    <RP.Root open={open} onOpenChange={onOpenChange}>
      {tooltip ? (
        // Forced shut while the panel is open: the tip has already been read by
        // then, and leaving it live means it reappears over the panel the moment
        // focus returns to the trigger.
        <TooltipRoot open={open ? false : undefined}>
          <TooltipTrigger asChild>{control}</TooltipTrigger>
          <TipSurface content={tooltip} {...props.tooltipPlacement} />
        </TooltipRoot>
      ) : (
        control
      )}
      <RP.Portal>
        <RP.Content
          className={["pop", props.className].filter(Boolean).join(" ")}
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
        >
          {children}
        </RP.Content>
      </RP.Portal>
    </RP.Root>
  );
}
