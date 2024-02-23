import re
from typing import List
import pyperclip as pc


INPUT_FILE = 'temp.txt'
"""
Place a bunch of Python functions/methods in this file
to auto-transpile their signatures to TS!
"""

with open(INPUT_FILE, 'r') as f:
    s = f.read()

# https://regex101.com/r/hhf0aE/1
pat = re.compile(r'def ([a-z0-9_]*?)\((?:self|cls)(?:, |: (?:[^\s,]*(?:, )?))?(.*)\) -> (.*):(?:\n\s*\"\"\"\n?((?:.|\n)*?)\n?\"\"\")?')

matches: List[tuple[str, str, str, str]] = pat.findall(s)

def split_not_in_brackets(s: str, sep: str, *, strip_elements: bool = False) -> List[str]:
    """
    Split a string on a delimeter when not inside a pair of brackets (`[]`).
    """
    result = []
    bracket_level = 0
    after_last_sep_idx = 0
    current_idx = 0
    while current_idx < len(s):
        if s[current_idx] == '[':
            bracket_level += 1
        elif s[current_idx] == ']':
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

    return to_camel_case(pname), ptype, pdefault

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

def type_py_to_ts(py_type: str) -> str:
    """
    Convert a Python type annotation to a TypeScript type annotation.
    """
    def helper(s: str) -> str:
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
            return 'null'

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
            b1 = s.find('[')
            b2 = get_matching_bracket_idx(s, b1)
            args = split_not_in_brackets(s[b1+1: b2], ',', strip_elements=True)
            assert len(args) == 2, f'Expected 2 types in Callable, got {len(args)}'
            params, ret_type = args
            params = split_not_in_brackets(params.strip('[]'), ',', strip_elements=True)
            return f'({", ".join(map(helper, params))}) => {helper(ret_type)}'
        if '[' not in s:
            # Assume type is also defined in TS
            return s
        
        raise ValueError(f'Unknown type: {s}')
    
    return helper(py_type)

def to_camel_case(s: str, *, upper_first_letter: bool = False) -> str:
    """
    Convert a string to camel case. Splits on underscores and capitalizes the 
    first letter of each word. Keeps leading underscores. If `upper_first_letter`
    is `True`, the first letter after any underscores will be capitalized.
    """
    if s.startswith('_'):
        return '_' + to_camel_case(s[1:], upper_first_letter=upper_first_letter)
    result = s.replace('_', ' ').title().replace(' ', '')
    if not upper_first_letter:
        result = result[0].lower() + result[1:]
    return result
    

def py_docstr_to_ts(py_docstr: str) -> str:
    """
    Convert a Python docstring to a JSDoc comment.
    """
    if not py_docstr:
        return ''

    first  = '/**'
    middle = ' * '
    last   = ' */'
    builder = [first]

    # First we have to de-indent the whole docstring. Get the minimum number of
    # spaces at the start of each line, and remove that many spaces from the start
    # of each line.
    lines = py_docstr.rstrip().splitlines()
    min_indent = min(len(line) - len(line.lstrip()) for line in lines if line.strip())
    lines = [line[min_indent:] for line in lines]

    # Then we can add the de-indented lines to the builder.
    for line in lines:
        builder.append(middle + line)
    
    builder.append(last)

    return '\n'.join(builder)


def main():
    method_builder = []
    for fn, params_list, ret, docstr in matches:
        docstr = py_docstr_to_ts(docstr)
        fn = to_camel_case(fn)
        args: List[tuple[str, str | None, str | None]] = []    
        kwargs: List[tuple[str, str | None, str | None]] = []
        
        # Extract args and kwargs from parameter list
        params_list = [extract_name_type_default(p) for p in split_not_in_brackets(params_list, ', ')]
        is_kwargs_section = False
        for pname, ptype, pdefault in params_list:
            if pname == '*':
                is_kwargs_section = True
                continue
        
            ts_ptype = type_py_to_ts(ptype)
            ts_pdefault = type_py_to_ts(pdefault) if pdefault is not None else None
            (args, kwargs)[is_kwargs_section].append((pname, ts_ptype, ts_pdefault))
        
        builder = []
        
        for pname, ptype, default in args:
            s = pname
            if ptype is not None:
                s += f': {ptype}'
            if default is not None:
                s += f' = {default}'
            builder.append(s)
        
        if kwargs:
            kwarg_format = '{{ {} }}: {{ {} }} = {{}}'
            pnames_with_defaults = []
            pnames_with_ptypes = []
            for pname, ptype, default in kwargs:
                assert ptype is not None

                if default is not None:
                    pnames_with_defaults.append(f'{pname} = {default}')
                    pnames_with_ptypes.append(f'{pname}?: {ptype}')
                else:
                    pnames_with_defaults.append(pname)
                    pnames_with_ptypes.append(f'{pname}: {ptype}')
            
            builder.append(kwarg_format.format(', '.join(pnames_with_defaults), ', '.join(pnames_with_ptypes)))

        args_str = ', '.join(builder)

        newline = '\n'
        method_builder.append(f'{docstr + newline if docstr else ""}{fn}({args_str}): {type_py_to_ts(ret)} {{}}')

    s = '\n\n'.join(method_builder)
    print(s)

    print()
    pc.copy(s)
    print('Copied to clipboard!')

if __name__ == '__main__':
    main()
