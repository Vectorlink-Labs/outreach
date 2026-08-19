"""
Every model must be imported here.

Alembic discovers tables through Base.metadata, and a model that is never
imported is invisible to it. A missing import here is the usual reason a
migration comes out empty.
"""

from outreach.db.base import Base
from outreach.db.models.product import CrawlMode, CrawlState, Product, ProductPage

__all__ = ["Base", "CrawlMode", "CrawlState", "Product", "ProductPage"]
