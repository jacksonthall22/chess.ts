"""Deterministic compiler for the selected frozen python-chess tests."""

from .model import TestIdentity
from .selection import TRANSLATED_TESTS

__all__ = ["TRANSLATED_TESTS", "TestIdentity"]
