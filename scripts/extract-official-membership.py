#!/usr/bin/env python3

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import pdfplumber


HIGH_SCHOOL_URL = (
    "https://www.ictr.edu.cn/Uploads/File/2025/02/07/"
    "4.%E6%99%AE%E9%80%9A%E9%AB%98%E4%B8%AD%E8%8B%B1%E8%AF%AD%E8%AF%BE%E7%A8%8B"
    "%E6%A0%87%E5%87%86%EF%BC%882017%E5%B9%B4%E7%89%882020%E5%B9%B4%E4%BF%AE"
    "%E8%AE%A2%EF%BC%89.20250207211247.pdf"
)
CET_URL = "https://cet.neea.edu.cn/res/Home/1704/55b02330ac17274664f06d9d3db8249d.pdf"
FULLWIDTH_NUMBERS = str.maketrans("１２３４５６７８９", "123456789")
CET_FORM_CORRECTIONS = {
    "accordingto": "according to",
    "babyboom": "baby boom",
    "babyboomer": "baby boomer",
    "connecxion": "connexion",
    "coupd\U001003b3état": "coup d'état",
    "o\U001001b3clock": "o'clock",
    "oughtto": "ought to",
    "owingto": "owing to",
    "instalation": "installation",
}
HIGH_SCHOOL_PARALLEL_FORMS = {
    "bride bridegroom": ["bride", "bridegroom"],
    "chairman chairwoman": ["chairman", "chairwoman"],
    "policeman policewoman": ["policeman", "policewoman"],
    "salesman saleswoman": ["salesman", "saleswoman"],
}


def file_hash(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def normalized_word_id(value):
    return re.sub(r"\s+", " ", value.strip()).lower()


def group_words(words, column_for, tolerance=1.5):
    groups = []
    for word in sorted(words, key=lambda item: (column_for(item), item["top"], item["x0"])):
        column = column_for(word)
        group = next(
            (
                candidate
                for candidate in reversed(groups[-4:])
                if candidate["column"] == column
                and abs(candidate["top"] - word["top"]) < tolerance
            ),
            None,
        )
        if group is None:
            group = {"column": column, "top": word["top"], "tokens": []}
            groups.append(group)
        group["tokens"].append(word)
    return groups


def high_school_entry(raw, order, pdf_page, printed_page, column):
    marker = "**" if raw.endswith("**") else "*" if raw.endswith("*") else ""
    source_display = raw.removesuffix(marker).strip()
    parallel = HIGH_SCHOOL_PARALLEL_FORMS.get(source_display.lower())
    display = " / ".join(parallel) if parallel else source_display
    parenthetical = re.findall(r"\(([^)]+)\)", display)
    variants = []
    for value in parenthetical:
        for variant in value.split(","):
            cleaned = re.sub(r"^pl\.\s*", "", variant.strip(), flags=re.IGNORECASE)
            if cleaned:
                variants.append(cleaned)
    headword = parallel[0] if parallel else re.sub(r"\s*\([^)]+\)\s*$", "", display).strip()
    forms = parallel if parallel else [headword, *variants]
    return {
        "id": f"hse-{order + 1:04d}",
        "headword": headword,
        "normalizedHeadword": normalized_word_id(headword),
        "display": display,
        "variants": forms[1:],
        "forms": [
            {
                "word": form,
                "normalizedWord": normalized_word_id(form),
                "relation": (
                    "headword"
                    if index == 0
                    else "parallel"
                    if parallel
                    else "variant"
                ),
            }
            for index, form in enumerate(forms)
        ],
        "level": (
            "selective-mandatory"
            if marker == "**"
            else "mandatory"
            if marker == "*"
            else "compulsory-foundation"
        ),
        "marker": marker,
        "order": order,
        "sourceLocation": {
            "pdfPage": pdf_page,
            "printedPage": printed_page,
            "column": column + 1,
        },
    }


def extract_high_school(path):
    pdf = pdfplumber.open(path)
    start_index = next(
        index
        for index, page in enumerate(pdf.pages)
        if "本词汇表共收 3000" in (page.extract_text() or "")
        and "a (an)" in (page.extract_text() or "")
    )
    country_index = next(
        index
        for index in range(start_index, len(pdf.pages))
        if "主要国家名称及相关信息" in (pdf.pages[index].extract_text() or "")
        and "COUNTRY" in (pdf.pages[index].extract_text() or "")
    )

    extracted = []
    for page_index in range(start_index, country_index + 1):
        page = pdf.pages[page_index]
        words = page.extract_words()
        if page_index == start_index:
            anchors = [
                word["top"]
                for word in words
                if word["text"] in {"a", "above"}
            ]
            floor = min(anchors) - 10
        else:
            floor = 55
        cutoff = 680
        if page_index == country_index:
            cutoff = min(
                word["top"]
                for word in words
                if word["text"].startswith("主要国家名称及相关信息")
            )
        vocabulary = [
            word
            for word in words
            if floor <= word["top"] < cutoff
            and (re.search(r"[A-Za-z]", word["text"]) or set(word["text"]) <= {"*"})
        ]
        groups = group_words(
            vocabulary,
            lambda word: 0 if word["x0"] < page.width * 0.4 else 1,
        )
        grouped_rows = []
        for group in groups:
            raw = " ".join(
                word["text"] for word in sorted(group["tokens"], key=lambda item: item["x0"])
            ).strip()
            grouped_rows.append({**group, "raw": raw})
        for group_index, group in enumerate(grouped_rows):
            raw = group["raw"]
            if re.fullmatch(r"[A-HJ-Z]", raw):
                continue
            if raw == "I" and any(
                candidate["raw"] == "I" and candidate["column"] == group["column"]
                for candidate in grouped_rows[group_index + 1:]
            ):
                continue
            if raw.count("(") > raw.count(")"):
                next_group = grouped_rows[group_index + 1]
                if next_group["column"] != group["column"]:
                    raise ValueError(f"Wrapped high-school entry changed columns: {raw}")
                raw = f"{raw} {next_group['raw']}"
                next_group["raw"] = ""
            if not raw:
                continue
            extracted.append(
                high_school_entry(
                    raw,
                    len(extracted),
                    page_index + 1,
                    page_index - 7,
                    group["column"],
                )
            )

    observed = Counter(entry["marker"] for entry in extracted)
    expected_observed = {"": 1500, "*": 499, "**": 1001}
    if len(extracted) != 3000 or dict(observed) != expected_observed:
        raise ValueError(
            f"Unexpected high-school extraction: count={len(extracted)}, markers={dict(observed)}"
        )
    collisions = {}
    for entry in extracted:
        collisions.setdefault(entry["normalizedHeadword"], []).append(entry["id"])
    collisions = {
        headword: ids for headword, ids in collisions.items() if len(ids) > 1
    }

    return {
        "schemaVersion": 1,
        "source": {
            "name": "普通高中英语课程标准（2017年版2020年修订）附录2词汇表",
            "publisher": "中华人民共和国教育部",
            "notice": "教材〔2020〕3号",
            "url": HIGH_SCHOOL_URL,
            "sha256": file_hash(path),
        },
        "declaredCounts": {
            "total": 3000,
            "compulsoryFoundation": 1500,
            "mandatory": 500,
            "selectiveMandatory": 1000,
        },
        "observedPrintedCounts": {
            "total": len(extracted),
            "compulsoryFoundation": observed[""],
            "mandatory": observed["*"],
            "selectiveMandatory": observed["**"],
        },
        "sourceAnomalies": [
            {
                "code": "printed-tier-count-mismatch",
                "description": (
                    "The appendix note declares 500 single-star and 1,000 double-star entries, "
                    "while the printed entry markers contain 499 and 1,001 respectively. "
                    "Printed markers are preserved without guessing a correction."
                ),
            }
        ],
        "caseInsensitiveCollisions": collisions,
        "entries": extracted,
    }


def expand_optional_letters(value):
    match = re.search(r"\(([^)]+)\)", value)
    if not match:
        return [value]
    without = f"{value[:match.start()]}{value[match.end():]}"
    with_optional = f"{value[:match.start()]}{match.group(1)}{value[match.end():]}"
    return [without, with_optional]


def expand_cet_token(source_token):
    token = source_token.replace("．", ".")
    pieces = token.split("/")
    expanded_pieces = [(pieces[0], "headword")]
    for piece in pieces[1:]:
        if piece.startswith("Ｇ"):
            suffix = piece[1:]
            previous = expanded_pieces[0][0]
            expanded_pieces.append((f"{previous[:-len(suffix)]}{suffix}", "variant"))
        else:
            expanded_pieces.append((piece, "parallel"))

    forms = []
    inherited_homograph = None
    for piece, relation in expanded_pieces:
        translated = piece.translate(FULLWIDTH_NUMBERS)
        homograph_match = re.search(r"([1-9])$", translated)
        homograph = int(homograph_match.group(1)) if homograph_match else inherited_homograph
        if homograph_match:
            piece = piece[:-1]
            inherited_homograph = homograph
        optional_forms = expand_optional_letters(piece.replace("Ｇ", "-"))
        for optional_index, value in enumerate(optional_forms):
            normalized = re.sub(r"\s+", " ", value).strip()
            normalized = CET_FORM_CORRECTIONS.get(normalized, normalized)
            form_relation = relation if optional_index == 0 else "variant"
            key = (normalized, homograph)
            if normalized and not any((form[0], form[2]) == key for form in forms):
                forms.append((normalized, form_relation, homograph))
    return [
        {
            "word": form,
            "id": normalized_word_id(form),
            "sourceToken": source_token,
            "relation": relation,
            **({"homograph": homograph} if homograph else {}),
        }
        for form, relation, homograph in forms
    ]


def extract_cet(path):
    pdf = pdfplumber.open(path)
    start_index = next(
        index
        for index, page in enumerate(pdf.pages)
        if "a/an" in (page.extract_text() or "")
        and "abbreviation" in (page.extract_text() or "")
    )
    end_index = next(
        index
        for index in range(start_index, len(pdf.pages))
        if "zoom" in (pdf.pages[index].extract_text() or "")
        and "５４１８" in (pdf.pages[index].extract_text() or "")
    )

    rows = []
    star_count = 0
    for page_index in range(start_index, end_index + 1):
        page = pdf.pages[page_index]
        words = page.extract_words()
        vocabulary = [
            word
            for word in words
            if 65 <= word["top"] <= 680
            and 50 <= word["x0"] < 500
            and word["text"] != "★"
            and not re.fullmatch(r"[0-9０-９]+", word["text"])
        ]
        groups = group_words(vocabulary, lambda _: 0, tolerance=2)
        page_rows = [
            {
                "top": group["top"],
                "tokens": [
                    word["text"]
                    for word in sorted(group["tokens"], key=lambda item: item["x0"])
                ],
                "starred": False,
            }
            for group in groups
        ]
        stars = [word for word in words if word["text"] == "★"]
        star_count += len(stars)
        for star in stars:
            nearest = min(
                page_rows,
                key=lambda row: abs((row["top"] + 7.335) - star["top"]),
            )
            distance = abs((nearest["top"] + 7.335) - star["top"])
            if distance >= 2:
                raise ValueError(
                    f"Could not align CET star on PDF page {page_index + 1}: distance={distance}"
                )
            nearest["starred"] = True

        for row in page_rows:
            forms = []
            for token in row["tokens"]:
                forms.extend(expand_cet_token(token))
            unique_forms = []
            seen = set()
            for form in forms:
                key = (form["id"], form.get("homograph"))
                if key not in seen:
                    seen.add(key)
                    unique_forms.append(form)
            rows.append(
                {
                    "id": f"cet-{len(rows) + 1:04d}",
                    "headword": unique_forms[0]["word"],
                    "level": "cet6-addition" if row["starred"] else "cet4",
                    "marker": "★" if row["starred"] else "",
                    "order": len(rows),
                    "forms": unique_forms,
                    "sourceTokens": row["tokens"],
                    "sourceLocation": {
                        "pdfPage": page_index + 1,
                        "printedPage": page_index - 4,
                    },
                }
            )

    if len(rows) != 5377 or star_count != 1263:
        raise ValueError(f"Unexpected CET extraction: rows={len(rows)}, stars={star_count}")
    flattened = [form for row in rows for form in row["forms"]]
    unique_forms = {form["id"] for form in flattened}
    return {
        "schemaVersion": 1,
        "source": {
            "name": "全国大学英语四、六级考试大纲（2016年修订版）词表",
            "publisher": "全国大学英语四、六级考试委员会",
            "url": CET_URL,
            "sha256": file_hash(path),
        },
        "declaredCounts": {
            "entries": 5418,
            "finalPageSecondaryNumber": 2551,
        },
        "observedStructure": {
            "physicalRows": len(rows),
            "starredRows": star_count,
            "expandedForms": len(flattened),
            "uniqueNormalizedForms": len(unique_forms),
        },
        "notes": [
            (
                "The source lays related and derived forms on one physical row. The declared "
                "5,418 entries therefore differs from the 5,377 extracted physical rows; both "
                "the rows and every printed form are preserved instead of forcing one count "
                "onto the other."
            )
        ],
        "entries": rows,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--high-school-pdf", required=True, type=Path)
    parser.add_argument("--cet-pdf", required=True, type=Path)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("scripts/data/official-membership"),
    )
    arguments = parser.parse_args()
    write_json(
        arguments.output_dir / "high-school.json",
        extract_high_school(arguments.high_school_pdf),
    )
    write_json(arguments.output_dir / "cet.json", extract_cet(arguments.cet_pdf))


if __name__ == "__main__":
    main()