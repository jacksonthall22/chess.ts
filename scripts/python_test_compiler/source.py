"""Strict source boundary for the frozen python-chess test compiler."""

from __future__ import annotations

import ast
import io
import tokenize
from collections import defaultdict
from pathlib import Path
from typing import Iterable, NoReturn

from .model import (
    CommentPlacement,
    SourceComment,
    SourceSpan,
    SourceUnit,
    TestIdentity,
    TestMethod,
)


class SourceParseError(ValueError):
    """The selected Python source cannot be represented by the compiler."""


def _source_line(source: str, line: int) -> str:
    lines = source.splitlines()
    return lines[line - 1] if 1 <= line <= len(lines) else ""


def _context_message(
    filename: str,
    source: str,
    line: int,
    column: int,
    message: str,
) -> str:
    source_line = _source_line(source, line)
    location = f"{filename}:{line}:{column + 1}: {message}"
    if not source_line:
        return location
    return "\n".join((location, source_line, f"{' ' * column}^"))


def _fail(
    filename: str,
    source: str,
    line: int,
    column: int,
    message: str,
) -> NoReturn:
    raise SourceParseError(
        _context_message(filename, source, line, column, message)
    )


def _text_column(source_line: str, utf8_column: int) -> int:
    """Convert an AST UTF-8 byte offset to a Python string column."""

    encoded_prefix = source_line.encode("utf-8")[:utf8_column]
    try:
        return len(encoded_prefix.decode("utf-8"))
    except UnicodeDecodeError as error:
        raise ValueError(
            f"AST column {utf8_column} splits a UTF-8 character"
        ) from error


def _node_span(node: ast.AST, source: str) -> SourceSpan:
    start_line = getattr(node, "lineno", None)
    start_column = getattr(node, "col_offset", None)
    end_line = getattr(node, "end_lineno", None)
    end_column = getattr(node, "end_col_offset", None)
    if None in (start_line, start_column, end_line, end_column):
        raise ValueError(f"{type(node).__name__} has no complete source location")

    start_text_column = _text_column(_source_line(source, start_line), start_column)
    end_text_column = _text_column(_source_line(source, end_line), end_column)
    return SourceSpan(
        start_line=start_line,
        start_column=start_text_column,
        end_line=end_line,
        end_column=end_text_column,
    )


def _parse_ast(source: str, filename: str) -> ast.Module:
    try:
        return ast.parse(source, filename=filename, type_comments=True)
    except SyntaxError as error:
        line = error.lineno or 1
        column = max((error.offset or 1) - 1, 0)
        _fail(filename, source, line, column, error.msg)


def _tokenize_source(
    source: str,
    filename: str,
) -> tuple[tokenize.TokenInfo, ...]:
    try:
        return tuple(tokenize.generate_tokens(io.StringIO(source).readline))
    except (IndentationError, tokenize.TokenError) as error:
        if isinstance(error, IndentationError):
            line = error.lineno or 1
            column = max((error.offset or 1) - 1, 0)
            message = error.msg
        else:
            message, position = error.args
            line, column = position
        _fail(filename, source, line, column, str(message))


def _validate_selection(
    selected: Iterable[TestIdentity],
    filename: str,
) -> tuple[TestIdentity, ...]:
    identities = tuple(selected)
    seen: set[TestIdentity] = set()
    duplicates: list[TestIdentity] = []
    for identity in identities:
        if identity in seen and identity not in duplicates:
            duplicates.append(identity)
        seen.add(identity)
    if duplicates:
        rendered = ", ".join(str(identity) for identity in duplicates)
        raise SourceParseError(
            f"{filename}: selected test identities contain duplicates: {rendered}"
        )
    return identities


def _candidate_methods(
    tree: ast.Module,
) -> dict[TestIdentity, list[ast.FunctionDef | ast.AsyncFunctionDef]]:
    candidates: dict[
        TestIdentity,
        list[ast.FunctionDef | ast.AsyncFunctionDef],
    ] = defaultdict(list)
    for statement in tree.body:
        if not isinstance(statement, ast.ClassDef):
            continue
        for member in statement.body:
            if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef)):
                identity = TestIdentity(statement.name, member.name)
                candidates[identity].append(member)
    return dict(candidates)


def _validate_method(
    identity: TestIdentity,
    node: ast.FunctionDef | ast.AsyncFunctionDef,
    source: str,
    filename: str,
) -> ast.FunctionDef:
    if isinstance(node, ast.AsyncFunctionDef):
        _fail(
            filename,
            source,
            node.lineno,
            node.col_offset,
            f"{identity} must not be async",
        )
    if node.decorator_list:
        decorator = node.decorator_list[0]
        _fail(
            filename,
            source,
            decorator.lineno,
            decorator.col_offset,
            f"{identity} must not be decorated",
        )

    arguments = node.args
    valid_self = (
        not arguments.posonlyargs
        and len(arguments.args) == 1
        and arguments.args[0].arg == "self"
        and not arguments.vararg
        and not arguments.kwonlyargs
        and not arguments.kwarg
        and not arguments.defaults
        and not arguments.kw_defaults
    )
    if not valid_self:
        _fail(
            filename,
            source,
            node.lineno,
            node.col_offset,
            f"{identity} must accept exactly one argument named self",
        )
    return node


def _comment_from_token(token: tokenize.TokenInfo, source: str) -> SourceComment:
    start_line, start_column = token.start
    end_line, end_column = token.end
    prefix = _source_line(source, start_line)[:start_column]
    placement = (
        CommentPlacement.INLINE if prefix.strip() else CommentPlacement.LEADING
    )
    return SourceComment(
        span=SourceSpan(
            start_line=start_line,
            start_column=start_column,
            end_line=end_line,
            end_column=end_column,
        ),
        text=token.string,
        placement=placement,
    )


def _function_token_range(
    node: ast.FunctionDef,
    tokens: tuple[tokenize.TokenInfo, ...],
    source: str,
    filename: str,
) -> tuple[int, int, int | None]:
    """Return the function token range and block-suite indentation column."""

    start_column = _text_column(_source_line(source, node.lineno), node.col_offset)
    try:
        function_index = next(
            index
            for index, token in enumerate(tokens)
            if token.type == tokenize.NAME
            and token.string == "def"
            and token.start == (node.lineno, start_column)
        )
    except StopIteration:
        _fail(
            filename,
            source,
            node.lineno,
            start_column,
            "could not locate function token",
        )

    bracket_depth = 0
    colon_index: int | None = None
    for index in range(function_index + 1, len(tokens)):
        token = tokens[index]
        if token.type != tokenize.OP:
            continue
        if token.string in "([{":
            bracket_depth += 1
        elif token.string in ")]}":
            bracket_depth -= 1
        elif token.string == ":" and bracket_depth == 0:
            colon_index = index
            break
    if colon_index is None:
        _fail(
            filename,
            source,
            node.lineno,
            start_column,
            "could not locate function suite",
        )

    newline_index = next(
        (
            index
            for index in range(colon_index + 1, len(tokens))
            if tokens[index].type == tokenize.NEWLINE
        ),
        None,
    )
    if newline_index is None:
        _fail(
            filename,
            source,
            node.lineno,
            start_column,
            "function suite has no terminating newline",
        )

    first_suite_token = next(
        (
            token
            for token in tokens[colon_index + 1 : newline_index]
            if token.type
            not in {tokenize.COMMENT, tokenize.NL, tokenize.INDENT, tokenize.DEDENT}
        ),
        None,
    )
    if first_suite_token is not None:
        return function_index, newline_index, None

    indent_index = next(
        (
            index
            for index in range(newline_index + 1, len(tokens))
            if tokens[index].type == tokenize.INDENT
        ),
        None,
    )
    if indent_index is None:
        _fail(
            filename,
            source,
            node.lineno,
            start_column,
            "block function suite has no indentation token",
        )

    depth = 1
    for index in range(indent_index + 1, len(tokens)):
        token = tokens[index]
        if token.type == tokenize.INDENT:
            depth += 1
        elif token.type == tokenize.DEDENT:
            depth -= 1
            if depth == 0:
                return function_index, index, tokens[indent_index].end[1]

    _fail(
        filename,
        source,
        node.lineno,
        start_column,
        "block function suite has no matching dedent token",
    )


def _comments_for_method(
    node: ast.FunctionDef,
    tokens: tuple[tokenize.TokenInfo, ...],
    source: str,
    filename: str,
) -> tuple[SourceComment, ...]:
    """Return every COMMENT token lexically owned by the function suite."""

    start, end, body_column = _function_token_range(node, tokens, source, filename)

    assert node.end_lineno is not None
    return tuple(
        _comment_from_token(token, source)
        for token in tokens[start:end]
        if token.type == tokenize.COMMENT
        and (
            body_column is None
            or token.start[1] >= body_column
            or token.start[0] <= node.end_lineno
        )
    )


def _method_span(
    node: ast.FunctionDef,
    source: str,
    comments: tuple[SourceComment, ...],
) -> SourceSpan:
    span = _node_span(node, source)
    if not comments:
        return span
    last_comment = max(comments, key=lambda comment: comment.span.end_position)
    if last_comment.span.end_position <= span.end_position:
        return span
    return SourceSpan(
        start_line=span.start_line,
        start_column=span.start_column,
        end_line=last_comment.span.end_line,
        end_column=last_comment.span.end_column,
    )


def parse_source_unit(
    source: str,
    selected: Iterable[TestIdentity],
    *,
    filename: str = "<unknown>",
) -> SourceUnit:
    """Parse and validate exactly the selected top-level unittest methods."""

    identities = _validate_selection(selected, filename)
    tree = _parse_ast(source, filename)
    tokens = _tokenize_source(source, filename)
    candidates = _candidate_methods(tree)

    methods: list[TestMethod] = []
    for identity in identities:
        matching = candidates.get(identity, [])
        if not matching:
            raise SourceParseError(f"{filename}: selected test is missing: {identity}")
        if len(matching) > 1:
            locations = ", ".join(str(node.lineno) for node in matching)
            raise SourceParseError(
                f"{filename}: selected test is defined more than once: "
                f"{identity} (lines {locations})"
            )
        node = _validate_method(identity, matching[0], source, filename)
        method_comments = _comments_for_method(node, tokens, source, filename)
        methods.append(
            TestMethod(
                identity=identity,
                node=node,
                span=_method_span(node, source, method_comments),
                comments=method_comments,
            )
        )

    return SourceUnit(
        filename=filename,
        source=source,
        tree=tree,
        methods=tuple(methods),
    )


def load_source_unit(
    path: str | Path,
    selected: Iterable[TestIdentity],
) -> SourceUnit:
    """Read a source file without newline conversion, then parse it once."""

    source_path = Path(path)
    with source_path.open("r", encoding="utf-8", newline="") as source_file:
        source = source_file.read()
    return parse_source_unit(source, selected, filename=str(source_path))
