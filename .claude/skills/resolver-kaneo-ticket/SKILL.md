---
name: resolver-kaneo-ticket
description: Toma un ticket de Kaneo (CW-N) o una descripción de tarea de cars-webscrapper, entiende el problema leyendo el código, arma un plan y lo implementa de forma autónoma hasta dejarlo verificado, actualizando el ticket en Kaneo. Usala cuando el usuario o un agente pida resolver, implementar o tomar un ticket de Kaneo (ej: "resolvé CW-7", "implementá este ticket").
---

# resolver-kaneo-ticket

Resuelve una tarea de punta a punta **sin pedir aprobación en el medio**: entender, planear,
implementar, verificar y actualizar Kaneo. Para este flujo, esta skill reemplaza la regla de
"un paso por vez esperando aprobación". La explicación va en el resumen final y en el ticket.

Todo lo que se escriba (comentarios en Kaneo, resumen) va en castellano, salvo la descripción
del PR, que va en inglés.

## Entrada

- `/resolver-kaneo-ticket CW-7`
- `/resolver-kaneo-ticket "Agregar filtro por combustible"`

Con un identificador, buscá el ticket con `mcp__kaneo__get_task_by_ticket_id` (con el ID completo,
ej: `ticketId: "CW-7"`) y leé también sus comentarios (`mcp__kaneo__list_task_comments`) y
relaciones (`mcp__kaneo__get_task_relations`). Las relaciones son contexto, no amplían el
alcance.

Con una descripción de texto y sin ticket, trabajá igual y al final no actualizás Kaneo.

Si las herramientas `mcp__kaneo__*` no responden, avisá y frená (probablemente Kaneo no está
levantado en Docker).

## Cuándo frenar en lugar de suponer

Frená **antes de tocar código** si, después de leer el ticket y el código, no podés responder
con certeza **qué** hay que cambiar y **cuál** es el resultado esperado. En ese caso dejá un
comentario en el ticket con las dudas concretas, no cambies su estado y avisale al usuario.

También frená si la tarea exige algo fuera del repo o irreversible: borrar datos, cambiar la
base de forma destructiva, o agregar una dependencia grande que el ticket no menciona.

## Fase 1: Entender

1. **Leé el código involucrado.** Seguí el flujo real (ver la arquitectura en `CLAUDE.md`), no
   te quedes solo con lo que dice el ticket.
2. **Marcá los límites.** Qué archivos entran en el alcance. Ojo con los contratos compartidos:
   - `apps/shared/types.ts` lo usan backend y frontend.
   - La salida de los adaptadores Python se valida con zod en `extractorClient.ts`. Si cambia
     un lado, cambia el otro.
   - `apps/shared/catalog.json` lo leen backend, frontend y adaptadores.
3. **Buscá patrones existentes.** Resolvé igual que el código parecido que ya existe (por
   ejemplo, un adaptador nuevo se parece a `cars_extractors/kavak.py`).

## Fase 2: Planear

Armá un plan corto, con pasos ordenados por dependencia y un cambio lógico por paso. Reglas:

- La solución más simple que resuelva el problema correctamente.
- Nada de abstracciones, configuraciones ni librerías nuevas que la tarea no pida.
- El último paso siempre es la verificación.

Antes de seguir, validá el plan: que los archivos y funciones que nombra existan, que no
agregue alcance, y que no tenga pasos innecesarios.

Si hay ticket:

- Dejá el plan como comentario (`mcp__kaneo__create_task_comment`) con el formato:

  ```markdown
  ## Plan
  **Qué:** una a tres oraciones.
  **Dónde:** archivos afectados.
  **Pasos:**
  1. ...
  2. ...
  **Riesgos:** si hay alguno.
  ```

- Mové el ticket a `in-progress` (`mcp__kaneo__update_task_status`). Si dudás del slug,
  confirmalo con `mcp__kaneo__list_project_columns`.

## Fase 3: Implementar

- Seguí el plan paso a paso. Si aparece algo inesperado que cambia el enfoque, ajustá el plan
  y anotalo para el resumen final. Si invalida la tarea, frená (ver arriba).
- Si algo falla, diagnosticá la causa antes de reintentar. No repitas el mismo intento.
- Comentarios en el código solo donde algo no sea obvio. Nunca escribas el identificador
  `CW-N` en el código.
- Respetá las buenas prácticas del repo: TypeScript estricto sin `any`, componentes React
  chicos, errores explícitos.

## Fase 4: Verificar

Corré lo que aplique según lo que tocaste, y arreglá lo que falle:

- `npm test` (vitest de backend y frontend).
- `npm run build` (incluye el chequeo de tipos con `tsc`).
- `cd tools/scrapling && uv run pytest` si tocaste Python.

`npm run lint` no funciona en este repo (no hay config de ESLint), no lo uses.

Si un test no se puede arreglar dentro del alcance, no lo ocultes: reportalo.

## Fase 5: Cerrar el trabajo

**No hagas commit ni push.** Git lo maneja el usuario.

Si hay ticket, dejá un comentario final y mové el ticket a `in-review`:

```markdown
## Resultado
Qué se hizo y por qué, en pocas oraciones.

**Cambios:**
- `ruta/archivo`: qué cambió.

**Verificación:** comandos corridos y resultado.
**Desvíos del plan:** si hubo.
**Pendientes:** si quedó algo fuera del alcance.

## Pull Request Description
<en inglés, lista para pegar: título estilo conventional commit, un párrafo de qué y por qué,
bullets con los cambios concretos, cómo se verificó y una línea "Kaneo: CW-N">
```

No lo muevas a `done`: el usuario lo cierra después de revisar.

Al usuario respondele con un resumen breve: qué cambió, el resultado de la verificación, los
desvíos o pendientes, y lo que conviene revisar con atención.
