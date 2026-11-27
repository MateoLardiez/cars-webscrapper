---
name: crear-kaneo-ticket
description: Crear, actualizar o cerrar un ticket (task) en Kaneo, el gestor de proyectos local, usando las herramientas mcp__kaneo__*. Busca duplicados antes de crear, asigna siempre al usuario y escribe el ticket en castellano. Usala cuando el usuario pida "crear un ticket", "abrir una task", "anotar esto en Kaneo", "actualizar el ticket CW-X", "cerrar CW-X", o cuando estés por proponer un ticket de seguimiento. También sirve para decidir si hace falta un ticket o alcanza con comentar uno existente.
---

# crear-kaneo-ticket

Crea, actualiza y cierra tickets en Kaneo con las herramientas `mcp__kaneo__*`. Si esas
herramientas no están disponibles, **frená y avisale al usuario** (probablemente el contenedor
de Docker de Kaneo no está levantado). No uses otro sistema de tickets como alternativa.

## Reglas

1. **Todo en castellano**: título, descripción y comentarios.
2. **Buscá duplicados antes de crear, siempre.** Si ya existe un ticket abierto sobre lo mismo,
   comentá ahí en lugar de crear otro.
3. **No crees tickets innecesarios.** Un detalle menor que se puede resolver en el trabajo en
   curso no necesita ticket. Creá uno solo si es trabajo separado que se perdería si no se anota.
4. **Asigná siempre al usuario.** Es el único que trabaja en el proyecto. Obtené su id con
   `mcp__kaneo__whoami` y pasalo como `userId`.
5. **Cerrá solo cuando el trabajo está hecho**, y decí cómo lo sabés.

## Contexto de Kaneo (resolverlo, no adivinarlo)

No hardcodees ids. Obtenelos en cada uso:

- Usuario: `mcp__kaneo__whoami` → `id`.
- Workspace: `mcp__kaneo__list_workspaces`.
- Proyecto: `mcp__kaneo__list_projects` con el `workspaceId`. Para este repo es
  **Cars Webscrapper** (slug `CW`, los tickets se ven como `CW-N`). Si hay más de un proyecto
  y no está claro cuál corresponde, preguntá.
- Estados: `mcp__kaneo__list_project_columns` con el `projectId`. Usá el `slug` de la columna
  (por ejemplo `to-do`, `in-progress`, `in-review`, `done`).

## Chequeo de duplicados

Antes de `mcp__kaneo__create_task`:

- Buscá con `mcp__kaneo__search` (pasando `workspaceId` y `type: "tasks"`) usando más de un
  término: el nombre de la funcionalidad, el archivo afectado, el mensaje de error.
- Si la búsqueda no alcanza, revisá `mcp__kaneo__list_tasks` del proyecto, incluyendo los
  tickets cerrados. Si hay uno cerrado sobre el mismo problema, conviene reabrirlo o comentarlo.
- Informá el resultado: "sin duplicados, busqué X, Y" o "duplicado: CW-N <título>, comento ahí".

## Entender el problema antes de escribir

La descripción no puede ser ambigua. Antes de redactarla, analizá el código:

- Leé los archivos involucrados y seguí el flujo hasta encontrar dónde está el problema o
  dónde va el cambio (archivo, función, componente).
- Si es un bug, identificá la causa o, como mínimo, cómo reproducirlo. No describas solo el
  síntoma.
- Definí un enfoque de solución concreto. Si hay más de una opción razonable, nombrá las
  opciones y cuál recomendás.
- Si después de investigar algo sigue sin estar claro (qué se espera, qué alcance tiene),
  **preguntale al usuario** antes de crear el ticket. No completes los huecos suponiendo.

## Crear

Con `mcp__kaneo__create_task`:

- **Título**: corto y concreto, en castellano, describiendo el resultado buscado
  (ej: "Agregar adaptador para CarOne").
- **Estado**: `to-do`, salvo que el usuario indique otro.
- **Prioridad**: `medium` por defecto. Ajustala según tu criterio:
  - `high`: un bug que rompe una funcionalidad principal o una feature importante.
  - `low`: algo menor, cosmético o que puede esperar.
  - Si el usuario indica una prioridad, usá esa.
- **userId**: el id del usuario (de `whoami`).
- **Descripción**, en markdown y con esta estructura:

  ```markdown
  ## Contexto
  Por qué hace falta: el problema o la necesidad, en pocas oraciones.

  ## Qué hay que hacer
  Enfoque de solución y lista de cambios concretos, nombrando los archivos y funciones
  que se tocan (ej: `tools/scrapling/cars_extractors/registry.py`, `searchSites()`).
  Si es un bug, incluí la causa encontrada o los pasos para reproducirlo.

  ## Criterios de aceptación
  - [ ] Condición verificable 1
  - [ ] Condición verificable 2
  ```

Mantenelo simple y conciso. Al terminar, pasale al usuario el identificador (`CW-N`) y el título.

## Actualizar

- **Cambiar estado**: `mcp__kaneo__update_task_status` con el slug de la columna.
- **Sumar contexto**: preferí un comentario (`mcp__kaneo__create_task_comment`) antes que
  reescribir la descripción, así queda el historial.
- **Cambiar título, descripción o prioridad**: `mcp__kaneo__update_task`, solo si el usuario lo
  pide o si el alcance cambió de verdad.
- Para encontrar el ticket por su identificador usá `mcp__kaneo__get_task_by_ticket_id`.

## Cerrar

1. Verificá que el trabajo esté terminado: tests pasando, cambio mergeado o una decisión que
   lo deja sin efecto.
2. Dejá un comentario de cierre diciendo cómo se resolvió (o por qué se descarta) y, si otro
   ticket lo reemplaza, cuál es.
3. Movelo a la columna final (`isFinal: true` en `list_project_columns`, normalmente `done`).
