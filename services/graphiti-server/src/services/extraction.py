"""Entity/relation extraction orchestration.

Extraction is handled internally by Graphiti's add_episode().
This module provides helpers for pre/post-processing if needed.
"""

import structlog

logger = structlog.get_logger()
