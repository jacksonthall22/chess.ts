import os
import re
from typing import List
import pyperclip as pc


def split_not_in_brackets(
        s: str,
        sep: str,
        *,
        open_bracket: str = '[',
        close_bracket: str = ']',
        strip_elements: bool = False
    ) -> List[str]:
    """
    Split a string on a delimeter `sep` when not inside a pair of brackets (`[]`).
    Optionally provide a different pair of brackets, which must be single characters.
    Delimeter may be multiple characters. If `strip_elements` is True, the elements
    will be stripped of leading and trailing whitespace.
    """
    result = []
    bracket_level = 0
    after_last_sep_idx = 0
    current_idx = 0
    while current_idx < len(s):
        if s[current_idx] == open_bracket:
            bracket_level += 1
        elif s[current_idx] == close_bracket:
            bracket_level -= 1
        elif s[current_idx:].startswith(sep) and bracket_level == 0:
            e = s[after_last_sep_idx:current_idx]
            if strip_elements:
                e = e.strip()
            result.append(e)
            after_last_sep_idx = current_idx + len(sep)
        current_idx += 1
    if after_last_sep_idx < len(s):
        e = s[after_last_sep_idx:]
        if strip_elements:
            e = e.strip()
        result.append(e)
    return result

def extract_name_type_default(param: str) -> tuple[str, str, str]:
    """
    Given an item in a Python function/method's parameter list as a string,
    get the parameter name (converted from string_case to camelCase), type (if typed),
    and default value (if set).
    """
    param = param.replace(': ', 'α').replace(' = ', 'β')
    colon_idx = param.find('α')
    equal_idx = param.find('β')
    if colon_idx == equal_idx == -1:
        pname, ptype, pdefault = param, None, None
    elif colon_idx != -1 and equal_idx == -1:
        pname, ptype, pdefault = param[:colon_idx], param[colon_idx+1:], None
    elif colon_idx == -1 and equal_idx != -1:
        pname, ptype, pdefault = param[:equal_idx], None, param[equal_idx+1:]
    else:
        pname, ptype, pdefault = param[:colon_idx], param[colon_idx+1:equal_idx], param[equal_idx+1:]

    return pname, ptype, pdefault

def get_matching_bracket_idx(s: str, opening_bracket_idx: int) -> int:
    """
    Return the index of the matching closing bracket for the opening bracket at the given index
    in the string.

    Raises ValueError if no matching closing bracket is found.
    """
    bracket_level = 0
    current_idx = opening_bracket_idx
    while current_idx < len(s):
        if s[current_idx] == '[':
            bracket_level += 1
        elif s[current_idx] == ']':
            bracket_level -= 1
            if bracket_level == 0:
                return current_idx
        current_idx += 1
    raise ValueError(f'No matching bracket found in string: {s}')

def get_first_brackets(s: str, *, assert_closes_at_end: bool = False) -> tuple[int, int]:
    """
    Return the index of the first opening bracket and its matching closing bracket.
    
    Raises ValueError if no opening bracket is found, or if no matching closing bracket is found.

    If assert_closes_at_end is True, also raises ValueError if the closing bracket is not at the end
    of the string.
    """
    b1 = s.find('[')
    if b1 == -1:
        raise ValueError(f'No opening bracket found in string: {s}')
    b2 = get_matching_bracket_idx(s, b1)
    if assert_closes_at_end and b2 != len(s) - 1:
        raise ValueError(f'Closing bracket not at the end of the string: {s}')
    return b1, b2

def get_end_of_block_idx(
        block_opening_line_idx: int,
        file_lines: List[str],
    ) -> int:
    """
    Given the 0-indexed line index of the opening line of a block (e.g. if statement,
    for loop, etc.), return the 0-indexed line index of the last line in the block.
    This is guaranteed not to be a whitespace line.

    If the given idx does not open a block (the next non-empty, non-whitespace line has
    the same or lesser indent), returns the given index.
    """
    line = file_lines[block_opening_line_idx]
    offset = len(line) - len(line.lstrip())  # Number of leading spaces

    # Whitespace and blank lines cannot open a block
    if not line or line.isspace():
        return block_opening_line_idx

    # If the next non-empty, non-whitespace line has the same or lesser indent,
    # this line does not open a block, so return the index of the line itself.
    for line in file_lines[block_opening_line_idx + 1:]:
        if not line or line.isspace():
            continue
        next_offset = len(line) - len(line.lstrip())
        if next_offset <= offset:
            return block_opening_line_idx
        break
    else:
        return block_opening_line_idx
    
    # Get index of first line with equal or lesser indent (goes one line too far)
    next_idx = block_opening_line_idx + 1
    while True:
        if next_idx == len(file_lines):
            break

        line = file_lines[next_idx]
        
        # Skip empty lines, which may have no indent
        if not line or line.isspace():
            next_idx += 1
            continue

        next_offset = len(line) - len(line.lstrip())
        
        if next_offset <= offset:
            break

        next_idx += 1

    # Roll back one    
    next_idx -= 1
    
    # Roll back while the last lines of the block have no content
    while not file_lines[next_idx] or file_lines[next_idx].isspace():
        next_idx -= 1
    
    return next_idx

def get_full_block(
        block_opening_line_idx: int,
        file_lines: List[str],
    ) -> str:
    """
    Given the 0-indexed line index of the opening line of a block (e.g. if statement, for loop,
    etc.), return a string with the all the lines (including the given one) in the block.
    """
    end_idx = get_end_of_block_idx(block_opening_line_idx, file_lines)
    block_lines = file_lines[block_opening_line_idx: end_idx + 1]
    return '\n'.join(block_lines)


'''
Recursive functions that change a particular value. These do not
operate on the entire string of the code at once.
'''
def py_val_to_ts(py_val: str) -> str:
    """Convert a Python value to a TypeScript value."""
    if py_val == 'None':
        return 'null'
    if py_val == 'True':
        return 'true'
    if py_val == 'False':
        return 'false'
    return py_val

def py_type_to_ts(py_type: str | None) -> str:
    """Convert a Python type annotation to a TypeScript type annotation."""
    def helper(s: str | None) -> str:
        if s is None:
            return 'any'
        if s == '':
            return ''
        if s == 'str':
            return 'string'
        if s in ('int', 'float'):
            return 'number'
        if s == 'bool':
            return 'boolean'
        if s == 'True':
            return 'true'
        if s == 'False':
            return 'false'
        if s == 'None':
            return 'void'

        if s.startswith('Union['):
            b1, b2 = get_first_brackets(s, assert_closes_at_end=True)
            args = split_not_in_brackets(s[b1+1: b2], ',', strip_elements=True)
            types = list(map(helper, args))
            unique_types = []
            for t in types:
                if t not in unique_types:
                    unique_types.append(t)
                
            return ' | '.join(unique_types)
        if s.startswith('Optional['):
            b1, b2 = get_first_brackets(s, assert_closes_at_end=True)
            return helper(s[b1+1: b2]) + ' | null'
        if s.startswith('List['):
            b1, b2 = get_first_brackets(s, assert_closes_at_end=True)
            args = split_not_in_brackets(s[b1+1: b2], ',', strip_elements=True)
            assert len(args) == 1, f'Expected 1 type in List, got {len(args)}'
            t, = args
            return f'Array<{helper(t)}>'
        if s.startswith('Mapping[') or s.startswith('Dict['):
            b1, b2 = get_first_brackets(s, assert_closes_at_end=True)
            args = split_not_in_brackets(s[b1+1: b2], ',', strip_elements=True)
            assert len(args) == 2, f'Expected 2 types in Mapping, got {len(args)}'
            t1, t2 = args
            return f'Map<{helper(t1)}, {helper(t2)}>'
        if s.startswith('Iterator['):
            b1, b2 = get_first_brackets(s, assert_closes_at_end=True)
            args = split_not_in_brackets(s[b1+1: b2], ',', strip_elements=True)
            assert len(args) == 1, f'Expected 1 type in Iterator, got {len(args)}'
            t, = args
            return f'Iterator<{helper(s[b1+1: b2])}>'
        if s.startswith('Iterable['):
            b1, b2 = get_first_brackets(s, assert_closes_at_end=True)
            args = split_not_in_brackets(s[b1+1: b2], ',', strip_elements=True)
            assert len(args) == 1, f'Expected 1 type in Iterable, got {len(args)}'
            t, = args
            return f'Iterable<{helper(t)}>'
        if s.lower().startswith('tuple['):
            b1, b2 = get_first_brackets(s, assert_closes_at_end=True)
            args = split_not_in_brackets(s[b1+1: b2], ',', strip_elements=True)
            return f'[{", ".join(map(helper, args))}]'
        if s.startswith('Callable['):
            b1, b2 = get_first_brackets(s, assert_closes_at_end=True)
            args = split_not_in_brackets(s[b1+1: b2], ',', strip_elements=True)
            assert len(args) == 2, f'Expected 2 types in Callable, got {len(args)}'
            params, ret_type = args
            params = split_not_in_brackets(params.strip('[]'), ',', strip_elements=True)
            return f'({", ".join(map(helper, params))}) => {helper(ret_type)}'
        if s.startswith('Mainline['):
            b1, b2 = get_first_brackets(s, assert_closes_at_end=True)
            args = split_not_in_brackets(s[b1+1: b2], ',', strip_elements=True)
            assert len(args) == 1, f'Expected 1 type in Mainline, got {len(args)}'
            t, = args
            return f'Mainline<{helper(t)}>'
        if s.startswith('BaseVisitor['):
            b1, b2 = get_first_brackets(s, assert_closes_at_end=True)
            args = split_not_in_brackets(s[b1+1: b2], ',', strip_elements=True)
            assert len(args) == 1, f'Expected 1 type in BaseVisitor, got {len(args)}'
            t, = args
            return f'BaseVisitor<{helper(t)}>'
        if '[' in s:
            b1, b2 = get_first_brackets(s, assert_closes_at_end=True)
            args = split_not_in_brackets(s[b1+1: b2], ',', strip_elements=True)
            return f'{s[:b1]}<{", ".join(map(helper, args))}>'
        
        # Assume other types are also defined in TS
        return s
    
    return helper(py_type)

def py_keyword_to_ts(py_keyword: str) -> str:
    if py_keyword == 'except':
        return 'catch'
    if py_keyword == 'elif':
        return 'else if'
    if py_keyword == 'None':
        return 'null'
    return py_keyword

def py_method_name_to_ts(py_method_name: str) -> str:
    """
    Convert a Python method name to a TypeScript method name. Some conventions
    may be specific to this project.
    """
    if py_method_name == '__init__':
        return 'constructor'
    if py_method_name == '__str__':
        return 'toString'
    if py_method_name == '__repr__':
        return 'toRepr'
    if py_method_name == '__eq__':
        return 'equals'
    return py_method_name


'''
Functions that operate on the entire string of the code at once.
'''
def py_misc_to_ts(py_str: str) -> str:
    """
    Convert various Python code to TypeScript syntax:
      - `self -> this`
      - `snake_case -> camelCase`
      - `None -> null`
      - `True -> true`
      - `False -> false`
      - `== -> ===`
      - `!= -> !==`
    
    These are all simple regex substitutions intended as a safe first pass 
    on an entire Python file before making more complex transformations.
    """
    # self -> this
    py_str = re.sub(r'(?<=\b)self(?=\b)', 'this', py_str)

    # snake_case -> camelCase
    py_str = re.sub(r'(?<=[a-z0-9])_([a-z0-9])', lambda m: m.group(1).upper(), py_str)

    # None -> null
    py_str = re.sub(r'(?<=\b)None(?=\b)', 'null', py_str)
    
    # True -> true
    py_str = re.sub(r'(?<=\b)True(?=\b)', 'true', py_str)

    # False -> false
    py_str = re.sub(r'(?<=\b)False(?=\b)', 'false', py_str)

    # == -> ===
    py_str = re.sub(r'(?:(?<=\b)|(?<= ))==(?=\b| )', '===', py_str)

    # != -> !==
    py_str = re.sub(r'(?:(?<=\b)|(?<= ))!=(?=\b| )', '!==', py_str)

    return py_str

def py_blocks_to_ts(py_str: str, *, indent_size: int = 4) -> str:
    """
    Convert Python `if/elif/else/while/for/try/except/finally` blocks to TypeScript syntax.
    """
    if_pat = re.compile(r'^( *)(?:(?:(if|elif|while|for|except) (.+?))|(?:(else|try|finally))):')
    
    py_str_lines = py_str.splitlines()

    # The length of the lines will change as we update block formatting with braces {},
    # so we need to update the length manually every time we change it.
    dynamic_len_py_str_lines = len(py_str_lines)

    # We are checking each line here for a match of the pattern, which matches when
    # the line opens one of the supported blocks. Then we get the full block, wrap it
    # in braces, convert the keyword to TS, and wrap the condition in parentheses if
    # one exists (only for `if/elif/while/for/except`).
    i = 0
    while i < dynamic_len_py_str_lines:
        line = py_str_lines[i]
        match = if_pat.match(line)
        if not match:
            i += 1
            continue
        
        # Here we know we have the opening of an if/elif/else/while/try/except/finally block.
        #   - `keyword` can hold `if/elif/while/for/except`
        #   - `keyword_no_condition` can hold `else/try/finally`
        spaces, keyword, condition, keyword_no_condition = match.groups()
        
        start_idx = i
        end_idx = get_end_of_block_idx(start_idx, py_str_lines)

        # If we just closed another block and this one is the next block in the chain,
        # we can remove the previous line with its closing brace and add one before
        # the keyword in this block.
        leading_brace = ''
        if py_str_lines[start_idx-1] == f'{spaces}}}':
            if keyword in ('elif', 'except') or keyword_no_condition in ('else', 'finally'):
                del py_str_lines[start_idx-1]
                dynamic_len_py_str_lines = len(py_str_lines)
                start_idx -= 1
                end_idx -= 1
                leading_brace = '} '
        
        # In the special case for `for` blocks, let's change `condition`:
        #  - `x in y` -> `x of y`
        if keyword == 'for':
            parts = split_not_in_brackets(condition, ' in ')
            assert len(parts) == 2, f'Expected 2 parts in for loop condition, got {len(parts)}. {condition=}'
            var, itr = parts
            condition = f'const {var} of {itr}'

        condition = f' ({condition})' if condition else ''
        keyword = py_keyword_to_ts(keyword if keyword else keyword_no_condition)

        # Build the TypeScript block
        if_block = py_str_lines[start_idx: end_idx + 1]
        ts_if_block = [
            f'{spaces}{leading_brace}{keyword}{condition} {{',
            *if_block[1:],
            f'{spaces}}}'
        ]

        # Python trick - you can replace a slice with another list of arbitrary size
        # Ex: [0, 1, 2][1:1] = [3, 4, 5] -> [0, 3, 4, 5, 1, 2]
        py_str_lines[start_idx: end_idx + 1] = ts_if_block
        dynamic_len_py_str_lines = len(py_str_lines)

        i += 1
    
    return '\n'.join(py_str_lines)

def py_docstr_to_ts(py_docstr: str, *, num_spaces: int = 0) -> str:
    """
    Convert a Python docstring to a JSDoc comment. If `num_spaces` is set, each
    line of the resulting comment block will be prepended with that many spaces.
    `py_docstr` should include the leading and trailing triple quote, and
    optionally the leading whitespace before the first triple quote.
    """
    if not py_docstr:
        return ''

    # First we have to de-indent the whole docstring. Below we remove the triple
    # quotes, get the minimum number of spaces at the start of each non-blank line,
    # and remove that many spaces from the start of each line.
    py_docstr = py_docstr.replace('\"\"\"', '')
    lines = py_docstr.splitlines()
    non_blank_lines = [line for line in lines if line and not line.isspace()]
    line_indent_sizes = [len(line) - len(line.lstrip()) for line in non_blank_lines]
    min_indent = min(line_indent_sizes) if line_indent_sizes else 0
    lines = [line[min_indent:] for line in lines]

    # Remove leading and trailing whitespace lines
    while not lines[0] or lines[0].isspace():
        del lines[0]
    while not lines[-1] or lines[-1].isspace():
        del lines[-1]

    # Build the JSDoc comment
    indent = ' ' * num_spaces
    first  = f'{indent}/**'
    middle = f'{indent} * '
    last   = f'{indent} */'

    ts_block = [
        first,
        *map(lambda line: middle + line, lines),
        last
    ]
    
    return '\n'.join(ts_block)

def py_methods_to_ts(py_str: str) -> str:
    """Convert all Python functions/methods found in `py_str` to TypeScript syntax."""
    # https://regex101.com/r/hhf0aE/5
    method_pat = re.compile(r'^( +)def ([a-zA-Z0-9_]+?)\((?:self|cls)(?:, |: (?:[^\s,]*(?:, )?))?(.*)\)(?: -> (.*))?:(.*)')

    # https://regex101.com/r/asYLn1/6
    # This should be used after `get_full_block()` as it uses newlines and 
    # asserts position at start of line. Replace this pat with the first
    # capture group ('\1') to remove the docstring.
    docstr_pat = re.compile(r'^( *def.*:[^\n]*)(\n\s+\"\"\"(?:\s|[^\"]|\"(?!\"\")|\"\"(?!\"))*\"\"\"(?:(?:\n(?: *|)(?!\S))+(?=\n))?)?')

    py_str_lines = py_str.splitlines()
    dynamic_len_py_str_lines = len(py_str_lines)

    # We are checking each line here for a match of the pattern, which matches when
    # the line opens a method block. Then we get the full block, wrap it
    # in braces and convert the signature to TS.
    i = 0
    while i < dynamic_len_py_str_lines:
        line = py_str_lines[i]
        match = method_pat.match(line)
        if not match:
            i += 1
            continue
        
        # Here we know we have the opening of a method block.
        spaces, method_name, params, return_type, after_colon = match.groups()
        method_name = py_method_name_to_ts(method_name)
        return_type = py_type_to_ts(return_type) if return_type is not None else None
        return_type = f': {return_type}' if return_type is not None else ''

        start_block_idx = i
        end_block_idx = get_end_of_block_idx(start_block_idx, py_str_lines)
        full_block = get_full_block(start_block_idx, py_str_lines)

        # Try to get the docstring if it exists.
        docstr_match = docstr_pat.match(full_block)
        docstr = ''
        if docstr_match and docstr_match.group(2) is not None:
            # Build the TypeScript docstr
            docstr = docstr_match.group(2).strip()
            docstr = py_docstr_to_ts(docstr, num_spaces=len(spaces))

            # Replace the signature + docstring with just the signature
            full_block = docstr_pat.sub(r'\1', full_block)
        docstr_lines = docstr.splitlines()
        full_block_lines = full_block.splitlines()
        
        # Extract positional args and kwargs from parameter list
        args: List[tuple[str, str | None, str | None]] = []    
        kwargs: List[tuple[str, str | None, str | None]] = []
        params_list = [extract_name_type_default(p) for p in split_not_in_brackets(params, ',', strip_elements=True)]
        is_kwargs_section = False
        for param_name, param_type, param_default in params_list:
            if param_name == '*':
                is_kwargs_section = True
                continue

            param_type = py_type_to_ts(param_type)
            param_default = py_val_to_ts(param_default) if param_default is not None else None
            (args, kwargs)[is_kwargs_section].append((param_name, param_type, param_default))
        
        # Start building the TypeScript parameter list
        arg_list_builder = []
        
        # Handle positional args
        for pname, ptype, pdefault in args:
            new_arg = pname
            if ptype is not None:
                new_arg += f': {ptype}'
            if pdefault is not None:
                new_arg += f' = {pdefault}'
            arg_list_builder.append(new_arg)
        
        # Handle keyword-only args
        if kwargs:
            kwarg_format = '{{ {} }}: {{ {} }} = {{}}'
            pnames_with_defaults = []
            pnames_with_ptypes = []
            for pname, ptype, pdefault in kwargs:
                assert ptype is not None

                if pdefault is not None:
                    pnames_with_defaults.append(f'{pname} = {pdefault}')
                    pnames_with_ptypes.append(f'{pname}?: {ptype}')
                else:
                    pnames_with_defaults.append(pname)
                    pnames_with_ptypes.append(f'{pname}: {ptype}')
            
            new_arg = kwarg_format.format(', '.join(pnames_with_defaults), ', '.join(pnames_with_ptypes))
            arg_list_builder.append(new_arg)

        args_str = ', '.join(arg_list_builder)

        # Build the TypeScript method signature and body
        ts_method = [
            *docstr_lines,
            f'{spaces}{method_name}({args_str}){return_type} {{{after_colon}',
            *full_block_lines[1:],
            f'{spaces}}}'
        ]

        # Replace the Python method with the TypeScript method
        py_str_lines[start_block_idx: end_block_idx + 1] = ts_method
        dynamic_len_py_str_lines = len(py_str_lines)

        # Jump below the docstring and the method signature
        i += len(docstr_lines) + 1

    return '\n'.join(py_str_lines)

def py_classes_to_ts(py_str: str) -> str:
    """Convert all Python classes found in `py_str` to TypeScript syntax."""
    # https://regex101.com/r/7Hw5wS/5
    class_pat = re.compile(r'^( *)class ([a-zA-Z0-9_]*?)(?:\((.*?)\))?:(.*)')
    
    # https://regex101.com/r/asYLn1/6
    # This should be used after `get_full_block()` as it uses newlines and 
    # asserts position at start of line. Replace this pat with the first
    # capture group ('\1') to remove the docstring.
    docstr_pat = re.compile(r'^( *class.*:[^\n]*)(\n\s+\"\"\"(?:\s|[^\"]|\"(?!\"\")|\"\"(?!\"))*\"\"\"(?:(?:\n(?: *|)(?!\S))+(?=\n))?)?')

    py_str_lines = py_str.splitlines()
    dynamic_len_py_str_lines = len(py_str_lines)

    # We are checking each line here for a match of the pattern, which matches
    # when the line opens a class block. Then we get the full block, wrap it
    # in braces and convert the signature to TS.
    i = 0
    while i < dynamic_len_py_str_lines:
        line = py_str_lines[i]
        match = class_pat.match(line)
        if not match:
            i += 1
            continue

        # Here we know we have the opening of a class block.
        spaces, class_name, base_classes, after_colon = match.groups()
        base_classes = f' extends {base_classes}' if base_classes else ''

        start_block_idx = i
        end_block_idx = get_end_of_block_idx(start_block_idx, py_str_lines)
        full_block = get_full_block(start_block_idx, py_str_lines)
        
        # Try to get the docstring if it exists.
        docstr_match = docstr_pat.match(full_block)
        docstr = ''
        if docstr_match and docstr_match.group(2) is not None:
            # Build the TypeScript docstr
            docstr = docstr_match.group(2).strip()
            docstr = py_docstr_to_ts(docstr, num_spaces=len(spaces))

            # Replace the signature + docstring with just the signature
            full_block = docstr_pat.sub(r'\1', full_block)
        docstr_lines = docstr.splitlines()
        full_block_lines = full_block.splitlines()

        # Build the TypeScript class signature and body
        ts_class = [
            *docstr_lines,
            f'{spaces}class {class_name}{base_classes} {{{after_colon}',
            *full_block_lines[1:],
            f'{spaces}}}'
        ]

        # Replace the Python class with the TypeScript class
        py_str_lines[start_block_idx: end_block_idx + 1] = ts_class
        dynamic_len_py_str_lines = len(py_str_lines)

        # Jump below the docstring and the class signature
        i += len(docstr_lines) + 1

    return '\n'.join(py_str_lines)

def py_dedent(
        py_str: str,
        *,
        old_indent_size: int = 4,
        new_indent_size: int = 2,
    ) -> str:
    """
    Naively dedent the Python code in `py_str` from `old_indent_size` to `new_indent_size`
    by replacing occurrences of `' ' * (old_indent_size * max_iters)` with `' ' * (new_indent_size * max_iters)`,
    then `' ' * (old_indent_size * (max_iters - 1))` with `' ' * (new_indent_size * (max_iters - 1))`, etc.
    """
    py_str_lines = py_str.splitlines()

    pat = re.compile(fr'^((?: {{{old_indent_size}}})+)')
    for i, line in enumerate(py_str_lines):
        match = pat.match(line)
        if match:
            indent = match.group(1)
            assert len(indent) % old_indent_size == 0
            new_indent = ' ' * new_indent_size * (len(indent) // old_indent_size)
            py_str_lines[i] = pat.sub(new_indent, line)
    
    return '\n'.join(py_str_lines)

def py_comments_to_ts(py_str: str) -> str:
    """
    Convert inline Python comments to inline TypeScript comments. This is a simple regex substitution
    that replaces instances of '# ' with '//'.
    """
    py_str = re.sub(r'(?:(?<=[^#])|^)#', '//', py_str)
    return py_str

def py_to_ts(py_str: str) -> str:
    """Convert Python code to TypeScript. Note that this is far from a perfect implementation!"""
    py_str = py_classes_to_ts(py_str)
    py_str = py_methods_to_ts(py_str)
    py_str = py_misc_to_ts(py_str)
    py_str = py_blocks_to_ts(py_str)
    py_str = py_dedent(py_str, old_indent_size=4, new_indent_size=2)
    py_str = py_comments_to_ts(py_str)

    return py_str


def main():
    while True:
        input('Press Enter to paste Python code and convert it to TypeScript...')
        s = pc.paste()
        if not s:
            print('No text found on clipboard!')
            continue

        s = py_to_ts(s)

        pc.copy(s)
        print('Converted code:')
        print('===============')
        print(s)
        print('===============')
        print('Copied to clipboard!')
        print()


if __name__ == '__main__':
    main()
