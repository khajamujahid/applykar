import { describe, expect, it } from "vitest";
import { extractBoards, nameSlugs } from "@/lib/discovery/extract";
import { parseList } from "@/lib/discovery/lists";

describe("board discovery", () => {
  it("extracts boards from links", () => {
    const refs = extractBoards(
      "https://job-boards.greenhouse.io/acme/jobs/1 https://jobs.lever.co/Foo/abc https://acme.wd5.myworkdayjobs.com/en-US/External/job/x https://careers-xyz.icims.com/jobs/1 https://bar.breezy.hr/p/1 https://jobs.lever.co/api",
    );
    expect(refs.map((r) => `${r.source}:${r.slug}`).sort()).toEqual(
      ["breezy:bar", "greenhouse:acme", "icims:xyz", "lever:foo", "workday:acme.wd5/External"].sort(),
    );
  });
  it("parses csv and json lists", () => {
    const csv = parseList("ats_vendor,company_name,board_slug\nashby,\"Ramp\",ramp\nlever,Jito,jito\n", "list.csv");
    expect(csv.refs.map((r) => `${r.source}:${r.slug}`)).toEqual(["ashby:ramp", "lever:jito"]);
    const json = parseList(JSON.stringify([{ ats: "greenhouse", slug: "stripe", company: "Stripe" }]), "x.json");
    expect(json.refs[0]).toMatchObject({ source: "greenhouse", slug: "stripe" });
    expect(parseList("name,slug\nAcme,acme\n", "personio.csv").names).toEqual(["Acme"]);
  });
  it("derives slug guesses from names", () => {
    expect(nameSlugs("Acme Robotics, Inc.")).toEqual(["acmerobotics", "acme-robotics", "acme"]);
  });
});
