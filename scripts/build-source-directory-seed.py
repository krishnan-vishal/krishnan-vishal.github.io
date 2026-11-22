"""Build private directory data from the owner-supplied GPIR v4 source matrix."""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

from docx import Document

ASEAN = set("BRN KHM IDN LAO MYS MMR PHL SGP THA TLS VNM".split())
FAR_EAST = set("CHN HKG JPN MAC MNG PRK KOR TWN".split())
SOUTH_ASIA = set("AFG BGD BTN IND MDV NPL PAK LKA".split())
OCEANIA = set("AUS NZL FJI KIR MHL FSM NRU PLW PNG WSM SLB TON TUV VUT".split())
GCC = set("BHR KWT OMN QAT SAU ARE".split())

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("matrix", type=Path)
    parser.add_argument("iso3166", type=Path, help="ISO 3166-1 JSON from iso-codes")
    args = parser.parse_args()
    iso = json.loads(args.iso3166.read_text())["3166-1"]
    by_code = {row["alpha_3"]: row["alpha_2"] for row in iso}
    by_name = {row["name"]: row["alpha_3"] for row in iso}
    by_name.update({"Hong Kong SAR": "HKG", "Vietnam": "VNM", "South Korea": "KOR", "Taiwan": "TWN", "UAE": "ARE", "UK": "GBR", "United Kingdom": "GBR", "Russia": "RUS"})
    matrix = Document(args.matrix)
    cards = {}

    def add(regions, kind, code, country, name, url, summary, coverage):
        if not url.startswith("https://"):
            url = f"https://{url}"
        parsed = urlsplit(url)
        if code not in by_code or "." not in (parsed.hostname or "") or parsed.username or parsed.password or re.search(r"\s", url):
            return
        for region in regions:
            key = (region, kind, by_code[code], name)
            cards[key] = (region, kind, by_code[code], country, name, url, summary, coverage)

    def rows(index):
        return ([cell.text.strip() for cell in row.cells] for row in matrix.tables[index].rows[1:])

    for index in (1, 2, 4, 12, 13, 14):
        for row in rows(index):
            if index in (1, 2, 4):
                country, iso_line, *_ = row[1].splitlines()
                code = iso_line.strip("()")
                name, url, coverage = row[2].splitlines()[0], row[3], row[6]
                role = row[2].partition("[")[2].rstrip("]")
                regions = ["APAC"] if index == 1 else []
                if index == 4 or "Tags: Africa" in row[1]:
                    regions.append("Africa")
                if code in GCC:
                    regions.append("GCC")
                for group, label in ((ASEAN, "ASEAN"), (FAR_EAST, "Far East"), (SOUTH_ASIA, "South Asia"), (OCEANIA, "Oceania")):
                    if index == 1 and code in group:
                        regions.append(label)
            else:
                _, code, country, name, url, coverage, tier, *_ = row
                role = "Monetary authority" if tier == "T1" else "Financial regulator"
                regions = [{12: "North America & Canada" if code in {"CAN", "USA"} else "LATAM", 13: "UK" if code == "GBR" else "Europe/SEPA", 14: "CIS"}[index]]
            add(regions, "bank", code, country, name, url, f"{role.capitalize()} source for {country}.", coverage)

    region_map = {"North America": "North America & Canada", "Americas": "North America & Canada", "Europe": "Europe/SEPA", "Oceania": "Oceania", "ASEAN": "ASEAN",
                  "Far East": "Far East", "South Asia": "South Asia", "APAC": "APAC", "Africa": "Africa",
                  "GCC": "GCC", "LATAM": "LATAM", "Europe/SEPA": "Europe/SEPA", "CIS": "CIS", "UK": "UK"}
    for index in (8, 11):
        for row in rows(index):
            region, country, name, kind, url = row[:5]
            code = by_name.get(country)
            if code and region in region_map and re.search(r"association|alliance|council|federation|network", kind, re.I):
                coverage = row[7]
                regions = ["UK" if code == "GBR" else region_map[region]]
                for group, label in ((ASEAN, "ASEAN"), (FAR_EAST, "Far East"), (SOUTH_ASIA, "South Asia"), (OCEANIA, "Oceania")):
                    if region == "APAC" and code in group:
                        regions.append(label)
                add(regions, "association", code, country, name, url, f"{kind.capitalize()} in {country}.", coverage)

    def literal(value):
        return "'" + value.replace("'", "''") + "'"

    if not cards:
        raise SystemExit("No valid directory cards")
    values = ",\n".join("(" + ", ".join(map(literal, row)) + ")" for row in sorted(cards.values()))
    print("begin;")
    print("insert into public.gpir_source_directory (region, kind, country_code, country, name, official_url, summary, coverage) values")
    print(values)
    print("on conflict (region, kind, country_code, name) do update set country = excluded.country, official_url = excluded.official_url, summary = excluded.summary, coverage = excluded.coverage;")
    print("commit;")

if __name__ == "__main__":
    main()
