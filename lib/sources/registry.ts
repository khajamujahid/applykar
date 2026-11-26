import type { BoardSource } from "@/lib/domain";
import { ashbyAdapter } from "@/lib/sources/ashby";
import { greenhouseAdapter } from "@/lib/sources/greenhouse";
import { leverAdapter } from "@/lib/sources/lever";
import { optionalAdapters } from "@/lib/sources/optional";
import { smartrecruitersAdapter } from "@/lib/sources/smartrecruiters";
import type { BoardAdapter, OptionalAdapter } from "@/lib/sources/types";
import { workableAdapter } from "@/lib/sources/workable";
import { bamboohrAdapter, breezyAdapter, icimsAdapter, jazzhrAdapter, recruiteeAdapter, ripplingAdapter, workdayAdapter } from "@/lib/sources/more";

export const boardAdapters: Record<BoardSource, BoardAdapter> = {
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  ashby: ashbyAdapter,
  smartrecruiters: smartrecruitersAdapter,
  workable: workableAdapter,
  workday: workdayAdapter,
  icims: icimsAdapter,
  recruitee: recruiteeAdapter,
  bamboohr: bamboohrAdapter,
  breezy: breezyAdapter,
  rippling: ripplingAdapter,
  jazzhr: jazzhrAdapter,
};

export function getBoardAdapter(source: BoardSource): BoardAdapter {
  return boardAdapters[source];
}

export function enabledOptionalAdapters(): OptionalAdapter[] {
  return optionalAdapters.filter((adapter) => adapter.enabled());
}
