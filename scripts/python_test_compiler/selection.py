"""The deliberate generated-test translation boundary."""

from __future__ import annotations

from .model import TestIdentity


def _tests(class_name: str, *method_names: str) -> tuple[TestIdentity, ...]:
    return tuple(TestIdentity(class_name, method_name) for method_name in method_names)


TRANSLATED_TESTS = (
    *_tests(
        "SquareTestCase",
        "test_square",
        "test_shifts",
        "test_parse_square",
        "test_square_distance",
        "test_square_manhattan_distance",
        "test_square_knight_distance",
    ),
    *_tests(
        "MoveTestCase",
        "test_equality",
        "test_uci_parsing",
        "test_invalid_uci",
        "test_xboard_move",
        "test_copy",
    ),
    *_tests(
        "PieceTestCase",
        "test_equality",
        "test_from_symbol",
        "test_hash",
    ),
    *_tests(
        "BoardTestCase",
        "test_default_position",
        "test_empty",
        "test_ply",
        "test_from_epd",
        "test_move_making",
        "test_fen",
        "test_xfen",
        "test_fen_en_passant",
        "test_get_set",
        "test_color_at",
        "test_pawn_captures",
        "test_pawn_move_generation",
        "test_single_step_pawn_move",
        "test_castling",
        "test_castling_san",
        "test_ninesixty_castling",
        "test_hside_rook_blocks_aside_castling",
        "test_selective_castling",
        "test_castling_right_not_destroyed_bug",
        "test_invalid_castling_rights",
        "test_ninesixty_different_king_and_rook_file",
        "test_ninesixty_prevented_castle",
        "test_find_move",
        "test_clean_castling_rights",
        "test_promotion_with_check",
        "test_ambiguous_move",
        "test_scholars_mate",
        "test_result",
        "test_san",
        "test_lan",
        "test_san_newline",
        "test_pawn_capture_san_without_file",
        "test_variation_san",
        "test_move_stack_usage",
        "test_is_legal_move",
        "test_move_count",
        "test_set_fen_as_epd",
        "test_clear",
        "test_promoted_comparison",
        "test_multiple_kings",
    ),
    *_tests(
        "LegalMoveGeneratorTestCase",
        "test_list_conversion",
        "test_nonzero",
        "test_string_conversion",
        "test_traverse_once",
    ),
    *_tests("BaseBoardTestCase", "test_set_piece_map"),
    *_tests(
        "SquareSetTestCase",
        "test_equality",
        "test_string_conversion",
        "test_iter",
        "test_reversed",
        "test_arithmetic",
        "test_immutable_set_operations",
        "test_mutable_set_operations",
        "test_from_square",
        "test_carry_rippler",
        "test_mirror",
        "test_flip",
        "test_len_of_complenent",
        "test_int_conversion",
        "test_tolist",
        "test_flip_ducktyping",
    ),
    *_tests(
        "PgnTestCase",
        "test_exporter",
        "test_promote_to_main",
        "test_read_game_with_multicomment_move",
        "test_comment_at_eol",
        "test_game_starting_comment",
        "test_game_starting_variation",
        "test_tree_traversal",
        "test_promote_demote",
        "test_add_line",
        "test_mainline",
        "test_annotations",
        "test_float_emt",
        "test_float_clk",
        "test_utf8_bom",
    ),
    *_tests("EngineTestCase", "test_score_ordering", "test_wdl_model"),
)


if len(TRANSLATED_TESTS) != 90:
    raise RuntimeError(
        f"translation selection must contain 90 methods, got {len(TRANSLATED_TESTS)}"
    )
