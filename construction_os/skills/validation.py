"""Deterministic skill package validation."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Optional

from open_notebook.skills.standard import (
    REQUIRED_ENTRY,
    extract_referenced_paths,
    normalize_relative_path,
    parse_skill_md,
    validate_file_path_rules,
    validate_skill_description,
    validate_skill_name,
)
from open_notebook.skills.zip_io import SkillFilePayload, build_skill_zip


@dataclass
class ValidationIssue:
    severity: str  # "error" | "warning"
    message: str
    path: Optional[str] = None
    fix: Optional[str] = None


@dataclass
class ValidationResult:
    valid: bool
    issues: list[ValidationIssue] = field(default_factory=list)

    @property
    def errors(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity == "error"]

    @property
    def warnings(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity == "warning"]

    def to_dict(self) -> dict:
        return {
            "valid": self.valid,
            "issues": [
                {
                    "severity": i.severity,
                    "message": i.message,
                    "path": i.path,
                    "fix": i.fix,
                }
                for i in self.issues
            ],
        }


def validate_skill_files(
    files: Iterable[SkillFilePayload],
    *,
    metadata_name: Optional[str] = None,
    metadata_description: Optional[str] = None,
    check_reconstruction: bool = True,
    export_root: str = "skill",
) -> ValidationResult:
    issues: list[ValidationIssue] = []
    file_list = list(files)
    by_path: dict[str, SkillFilePayload] = {}

    for f in file_list:
        path_errors = validate_file_path_rules(f.path)
        for err in path_errors:
            issues.append(
                ValidationIssue(
                    "error",
                    err,
                    path=f.path,
                    fix="Rename or remove the file so the path is safe and supported",
                )
            )
        try:
            normalized = normalize_relative_path(f.path)
        except Exception as e:
            issues.append(ValidationIssue("error", str(e), path=f.path))
            continue
        if normalized in by_path:
            issues.append(
                ValidationIssue(
                    "error",
                    f"Duplicate path: {normalized}",
                    path=normalized,
                    fix="Remove or rename the duplicate file",
                )
            )
        else:
            by_path[normalized] = f

    if REQUIRED_ENTRY not in by_path:
        issues.append(
            ValidationIssue(
                "error",
                "Required file SKILL.md is missing",
                path=REQUIRED_ENTRY,
                fix="Add a SKILL.md file with YAML frontmatter (name, description)",
            )
        )
    else:
        skill_file = by_path[REQUIRED_ENTRY]
        if skill_file.encoding != "utf-8":
            issues.append(
                ValidationIssue(
                    "error",
                    "SKILL.md must be UTF-8 text",
                    path=REQUIRED_ENTRY,
                    fix="Save SKILL.md as UTF-8 markdown",
                )
            )
        else:
            parsed = parse_skill_md(skill_file.content)
            for err in parsed.errors:
                issues.append(
                    ValidationIssue(
                        "error",
                        err,
                        path=REQUIRED_ENTRY,
                        fix="Fix SKILL.md frontmatter: required fields name and description",
                    )
                )
            if parsed.name and metadata_name and parsed.name != metadata_name:
                issues.append(
                    ValidationIssue(
                        "warning",
                        f"Metadata name '{metadata_name}' differs from SKILL.md name '{parsed.name}'",
                        path=REQUIRED_ENTRY,
                        fix="Align skill metadata name with SKILL.md frontmatter name",
                    )
                )
            for ref in extract_referenced_paths(parsed.body):
                if ref not in by_path:
                    issues.append(
                        ValidationIssue(
                            "warning",
                            f"Referenced file does not exist: {ref}",
                            path=REQUIRED_ENTRY,
                            fix=f"Add {ref} to the skill package or remove the reference",
                        )
                    )

    if metadata_name:
        for err in validate_skill_name(metadata_name):
            issues.append(
                ValidationIssue(
                    "error",
                    err,
                    fix="Use a kebab-case name (lowercase, hyphens)",
                )
            )
    if metadata_description:
        for err in validate_skill_description(metadata_description):
            issues.append(
                ValidationIssue(
                    "error",
                    err,
                    fix="Provide a non-empty description under 1024 characters",
                )
            )

    if check_reconstruction and not any(i.severity == "error" for i in issues):
        try:
            build_skill_zip(file_list, export_root or metadata_name or "skill")
        except Exception as e:
            issues.append(
                ValidationIssue(
                    "error",
                    f"Package cannot be reconstructed as ZIP: {e}",
                    fix="Ensure all file paths and contents are valid",
                )
            )

    valid = not any(i.severity == "error" for i in issues)
    return ValidationResult(valid=valid, issues=issues)
