"""
Template store service for managing run templates.
"""

import json
from datetime import datetime
from typing import Optional

from app.db.session import get_db
from app.db.models import (
    RunConfig,
    RunTemplate,
    RunTemplateCreate,
    RunTemplateSummary,
)


class TemplateStore:
    """Service for storing and retrieving run templates from SQLite."""

    async def create_template(
        self,
        template_create: RunTemplateCreate,
        user_id: str,
    ) -> RunTemplate:
        """Create a new run template."""
        # Build config from template create fields
        config = RunConfig(
            benchmark=template_create.benchmark,
            model=template_create.model,
            limit=template_create.limit,
            temperature=template_create.temperature,
            top_p=template_create.top_p,
            max_tokens=template_create.max_tokens,
            timeout=template_create.timeout,
            epochs=template_create.epochs,
            max_connections=template_create.max_connections,
        )
        
        template = RunTemplate(
            user_id=user_id,
            name=template_create.name,
            benchmark=template_create.benchmark,
            model=template_create.model,
            config=config,
        )
        
        async with get_db() as db:
            await db.execute(
                """
                INSERT INTO run_templates (
                    template_id, user_id, name, benchmark, model,
                    config_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    template.template_id,
                    template.user_id,
                    template.name,
                    template.benchmark,
                    template.model,
                    config.model_dump_json(),
                    template.created_at.isoformat(),
                    template.updated_at.isoformat(),
                ),
            )
            await db.commit()
        
        return template

    async def get_template(
        self,
        template_id: str,
        user_id: str,
    ) -> Optional[RunTemplate]:
        """Get a template by ID (must belong to user)."""
        async with get_db() as db:
            cursor = await db.execute(
                "SELECT * FROM run_templates WHERE template_id = ? AND user_id = ?",
                (template_id, user_id),
            )
            row = await cursor.fetchone()
            if row is None:
                return None
            return self._row_to_template(row)

    async def list_templates(
        self,
        user_id: str,
        limit: int = 100,
    ) -> list[RunTemplateSummary]:
        """List all templates for a user."""
        async with get_db() as db:
            cursor = await db.execute(
                """
                SELECT * FROM run_templates 
                WHERE user_id = ? 
                ORDER BY created_at DESC 
                LIMIT ?
                """,
                (user_id, limit),
            )
            rows = await cursor.fetchall()
            return [self._row_to_summary(row) for row in rows]

    async def update_template(
        self,
        template_id: str,
        user_id: str,
        name: str,
    ) -> Optional[RunTemplate]:
        """Update a template's name."""
        # Check template exists
        template = await self.get_template(template_id, user_id)
        if template is None:
            return None
        
        now = datetime.utcnow().isoformat()
        
        async with get_db() as db:
            await db.execute(
                """
                UPDATE run_templates 
                SET name = ?, updated_at = ?
                WHERE template_id = ? AND user_id = ?
                """,
                (name, now, template_id, user_id),
            )
            await db.commit()
        
        return await self.get_template(template_id, user_id)

    async def delete_template(
        self,
        template_id: str,
        user_id: str,
    ) -> bool:
        """Delete a template."""
        # Check template exists
        template = await self.get_template(template_id, user_id)
        if template is None:
            return False
        
        async with get_db() as db:
            await db.execute(
                "DELETE FROM run_templates WHERE template_id = ? AND user_id = ?",
                (template_id, user_id),
            )
            await db.commit()
        
        return True

    def _row_to_template(self, row) -> RunTemplate:
        """Convert a database row to a RunTemplate model."""
        config = None
        if row["config_json"]:
            config = RunConfig(**json.loads(row["config_json"]))
        
        return RunTemplate(
            template_id=row["template_id"],
            user_id=row["user_id"],
            name=row["name"],
            benchmark=row["benchmark"],
            model=row["model"],
            config=config,
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    def _row_to_summary(self, row) -> RunTemplateSummary:
        """Convert a database row to a RunTemplateSummary model."""
        return RunTemplateSummary(
            template_id=row["template_id"],
            name=row["name"],
            benchmark=row["benchmark"],
            model=row["model"],
            created_at=datetime.fromisoformat(row["created_at"]),
        )


# Global instance
template_store = TemplateStore()
