"""Immutable source model for the frozen python-chess test compiler."""

from __future__ import annotations

import ast
from dataclasses import dataclass
from enum import Enum
from typing import Collection, Iterable


@dataclass(frozen=True, order=True, slots=True)
class TestIdentity:
    """The stable upstream identity of one unittest method."""

    class_name: str
    method_name: str

    def __post_init__(self) -> None:
        if not self.class_name:
            raise ValueError("a test identity requires a class name")
        if not self.method_name:
            raise ValueError("a test identity requires a method name")

    def __str__(self) -> str:
        return f"{self.class_name}.{self.method_name}"


@dataclass(frozen=True, order=True, slots=True)
class SourceSpan:
    """A half-open source range using one-based lines and zero-based columns."""

    start_line: int
    start_column: int
    end_line: int
    end_column: int

    def __post_init__(self) -> None:
        if self.start_line < 1 or self.end_line < 1:
            raise ValueError("source span lines must be positive")
        if self.start_column < 0 or self.end_column < 0:
            raise ValueError("source span columns must be non-negative")
        if self.end_position < self.start_position:
            raise ValueError("a source span cannot end before it starts")

    @property
    def start_position(self) -> tuple[int, int]:
        return self.start_line, self.start_column

    @property
    def end_position(self) -> tuple[int, int]:
        return self.end_line, self.end_column

    def contains_position(self, line: int, column: int) -> bool:
        return self.start_position <= (line, column) < self.end_position

    def contains(self, other: SourceSpan) -> bool:
        return (
            self.start_position <= other.start_position
            and other.end_position <= self.end_position
        )

    def extract(self, source: str) -> str:
        """Return the exact text covered by this span."""

        lines = source.splitlines(keepends=True)
        if self.end_line > len(lines):
            raise ValueError(
                f"source has {len(lines)} lines, but span ends on line {self.end_line}"
            )

        if self.start_line == self.end_line:
            line = lines[self.start_line - 1]
            return line[self.start_column : self.end_column]

        first = lines[self.start_line - 1][self.start_column :]
        middle = lines[self.start_line : self.end_line - 1]
        last = lines[self.end_line - 1][: self.end_column]
        return "".join((first, *middle, last))


class CommentPlacement(str, Enum):
    """How a Python comment is positioned relative to code on its line."""

    LEADING = "leading"
    INLINE = "inline"


@dataclass(frozen=True, order=True, slots=True)
class SourceComment:
    """One exact COMMENT token owned by a selected test method."""

    span: SourceSpan
    text: str
    placement: CommentPlacement

    def __post_init__(self) -> None:
        if not self.text.startswith("#"):
            raise ValueError("source comment text must include its leading '#'")

    @property
    def is_inline(self) -> bool:
        return self.placement is CommentPlacement.INLINE


@dataclass(frozen=True, slots=True)
class TestMethod:
    """A validated upstream test method and the comments it owns."""

    identity: TestIdentity
    node: ast.FunctionDef
    span: SourceSpan
    comments: tuple[SourceComment, ...]

    @property
    def leading_comments(self) -> tuple[SourceComment, ...]:
        return tuple(
            comment
            for comment in self.comments
            if comment.placement is CommentPlacement.LEADING
        )

    @property
    def inline_comments(self) -> tuple[SourceComment, ...]:
        return tuple(
            comment
            for comment in self.comments
            if comment.placement is CommentPlacement.INLINE
        )

    def unclaimed_comments(
        self,
        claimed: Collection[SourceComment] | Iterable[SourceComment],
    ) -> tuple[SourceComment, ...]:
        """Return comments a renderer has not explicitly claimed."""

        claimed_comments = frozenset(claimed)
        return tuple(
            comment for comment in self.comments if comment not in claimed_comments
        )


@dataclass(frozen=True, slots=True)
class SourceUnit:
    """One parsed Python source file and its selected, validated tests."""

    filename: str
    source: str
    tree: ast.Module
    methods: tuple[TestMethod, ...]

    def method(self, identity: TestIdentity) -> TestMethod:
        matches = tuple(
            method for method in self.methods if method.identity == identity
        )
        if len(matches) != 1:
            raise KeyError(f"source unit does not contain exactly one {identity}")
        return matches[0]

    def source_for(self, span: SourceSpan) -> str:
        return span.extract(self.source)

    def source_for_method(self, identity: TestIdentity) -> str:
        return self.source_for(self.method(identity).span)

    @property
    def comments(self) -> tuple[SourceComment, ...]:
        return tuple(
            comment for method in self.methods for comment in method.comments
        )

    def unclaimed_comments(
        self,
        claimed: Collection[SourceComment] | Iterable[SourceComment],
    ) -> tuple[SourceComment, ...]:
        """Return selected comments a renderer has not explicitly claimed."""

        claimed_comments = frozenset(claimed)
        return tuple(
            comment for comment in self.comments if comment not in claimed_comments
        )
