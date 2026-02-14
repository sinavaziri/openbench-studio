"""
Run template management routes.

Handles creating, listing, updating, and deleting run templates,
as well as creating runs from templates.
"""

from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends

from app.core.auth import get_current_user
from app.core.errors import (
    NotFoundError,
    ServerError,
)
from app.db.models import (
    RunConfig,
    RunCreate,
    RunTemplate,
    RunTemplateCreate,
    RunTemplateSummary,
    RunTemplateUpdate,
    RunFromTemplateResponse,
    MessageResponse,
    User,
)
from app.runner.executor import executor
from app.services.api_keys import api_key_service
from app.services.run_store import run_store
from app.services.template_store import template_store

router = APIRouter()


@router.post(
    "/templates",
    response_model=RunTemplate,
    summary="Create a run template",
    description="Save a benchmark configuration as a reusable template.",
    responses={
        200: {
            "description": "Template created successfully",
        },
        401: {
            "description": "Not authenticated",
        },
        422: {
            "description": "Validation error",
        }
    }
)
async def create_template(
    template_create: RunTemplateCreate,
    current_user: User = Depends(get_current_user),
):
    """
    Create a new run template.
    
    Templates save benchmark configurations for quick reuse.
    They include the benchmark, model, and all run parameters.
    
    **Requires authentication.**
    """
    template = await template_store.create_template(
        template_create,
        user_id=current_user.user_id,
    )
    return template


@router.get(
    "/templates",
    response_model=List[RunTemplateSummary],
    summary="List templates",
    description="List all saved run templates for the current user.",
    responses={
        200: {
            "description": "List of template summaries",
        },
        401: {
            "description": "Not authenticated",
        }
    }
)
async def list_templates(
    limit: int = 100,
    current_user: User = Depends(get_current_user),
):
    """
    List all templates for the current user.
    
    Returns templates ordered by creation date (newest first).
    
    **Requires authentication.**
    """
    return await template_store.list_templates(
        user_id=current_user.user_id,
        limit=limit,
    )


@router.get(
    "/templates/{template_id}",
    response_model=RunTemplate,
    summary="Get template details",
    description="Get full details of a specific template.",
    responses={
        200: {
            "description": "Template details",
        },
        401: {
            "description": "Not authenticated",
        },
        404: {
            "description": "Template not found",
        }
    }
)
async def get_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Get details of a specific template.
    
    **Requires authentication.**
    """
    template = await template_store.get_template(
        template_id,
        user_id=current_user.user_id,
    )
    if template is None:
        raise NotFoundError(
            resource="Template",
            detail="The requested template was not found or you don't have access to it."
        )
    return template


@router.patch(
    "/templates/{template_id}",
    response_model=RunTemplate,
    summary="Update template",
    description="Update a template's name.",
    responses={
        200: {
            "description": "Template updated",
        },
        401: {
            "description": "Not authenticated",
        },
        404: {
            "description": "Template not found",
        },
        500: {
            "description": "Failed to update template",
        }
    }
)
async def update_template(
    template_id: str,
    update: RunTemplateUpdate,
    current_user: User = Depends(get_current_user),
):
    """
    Update a template's name.
    
    **Requires authentication.**
    """
    template = await template_store.update_template(
        template_id,
        user_id=current_user.user_id,
        name=update.name,
    )
    if template is None:
        raise NotFoundError(
            resource="Template",
            detail="The requested template was not found or you don't have access to it."
        )
    return template


@router.delete(
    "/templates/{template_id}",
    response_model=MessageResponse,
    summary="Delete template",
    description="Delete a run template.",
    responses={
        200: {
            "description": "Template deleted",
            "content": {
                "application/json": {
                    "example": {"status": "deleted"}
                }
            }
        },
        401: {
            "description": "Not authenticated",
        },
        404: {
            "description": "Template not found",
        }
    }
)
async def delete_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Delete a template.
    
    This does not affect any runs that were created from this template.
    
    **Requires authentication.**
    """
    success = await template_store.delete_template(
        template_id,
        user_id=current_user.user_id,
    )
    if not success:
        raise NotFoundError(
            resource="Template",
            detail="The requested template was not found or you don't have access to it."
        )
    return {"status": "deleted"}


@router.post(
    "/templates/{template_id}/run",
    response_model=RunFromTemplateResponse,
    summary="Create run from template",
    description="Start a new benchmark run using a saved template's configuration.",
    responses={
        200: {
            "description": "Run created and started",
            "content": {
                "application/json": {
                    "example": {"run_id": "550e8400-e29b-41d4-a716-446655440000"}
                }
            }
        },
        401: {
            "description": "Not authenticated",
        },
        404: {
            "description": "Template not found",
        }
    }
)
async def create_run_from_template(
    template_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """
    Create and start a new benchmark run from a template.
    
    Uses the template's saved configuration (benchmark, model, parameters).
    The run is created immediately and execution begins in the background.
    
    **Requires authentication.**
    """
    # Get the template
    template = await template_store.get_template(
        template_id,
        user_id=current_user.user_id,
    )
    if template is None:
        raise NotFoundError(
            resource="Template",
            detail="The requested template was not found or you don't have access to it."
        )
    
    # Create run from template config
    run_create = RunCreate(
        benchmark=template.benchmark,
        model=template.model,
        limit=template.config.limit if template.config else None,
        temperature=template.config.temperature if template.config else None,
        top_p=template.config.top_p if template.config else None,
        max_tokens=template.config.max_tokens if template.config else None,
        timeout=template.config.timeout if template.config else None,
        epochs=template.config.epochs if template.config else None,
        max_connections=template.config.max_connections if template.config else None,
    )
    
    run = await run_store.create_run(
        run_create,
        user_id=current_user.user_id,
        template_id=template.template_id,
        template_name=template.name,
    )
    
    # Get user's API keys for the run
    env_vars = await api_key_service.get_decrypted_keys_for_run(current_user.user_id)
    
    # Start execution in background
    background_tasks.add_task(executor.execute_run, run, env_vars)
    
    return {"run_id": run.run_id}
