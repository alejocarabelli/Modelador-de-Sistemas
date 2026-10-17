# Guía JSON para IA: todos los artefactos de DCCreador

Esta guía define cómo generar los cinco tipos de artefactos admitidos por el Modelador de Sistemas, con su estructura JSON real, reglas de presentación y ejemplos completos. Se descarga desde **Nuevo artefacto → Guía de artefactos para IA (.md)** o desde **Importar artefacto**.

## Instrucción para la IA

Analizá el dominio y los requisitos solicitados. Elegí el tipo de artefacto adecuado, usá exactamente las estructuras documentadas y entregá un JSON válido, en UTF-8, listo para importar. Incluí el contenido necesario para cumplir el alcance, con nombres claros y una presentación legible. No agregues comentarios, cercas Markdown, comas finales, funciones ni campos inventados al archivo JSON. Si falta un dato del negocio que determina el modelo, pedí esa información antes de entregar el archivo definitivo.

Cuando se pidan varios artefactos vinculados, entregá un proyecto completo con IDs coherentes. Conservá las convenciones y los datos del proyecto de partida. No inventes multiplicidades, condiciones, caminos alternativos, operaciones ni estereotipos como si fueran requisitos confirmados. Los ejemplos de esta guía ilustran el formato; sus reglas del negocio no se trasladan automáticamente a otro dominio.

## 1. Contrato común, importación e identificadores

| `type` del artefacto | Artefacto | Estructura principal de `content` |
| --- | --- | --- |
| `class-diagram` | Diagrama de clases | `nodes`, `edges`. |
| `use-case-model` | Modelo de casos de uso | `nodes`, `edges`, con sus tipos propios. |
| `use-case-flow` | Flujo de sucesos | `description`, `basicFlow`, `alternativeFlows`. |
| `sequence-diagram` | Diagrama de secuencia | `version`, `participants`, `items`, `activations`, `notes`, `canvas` y opciones. |
| `class-sequence-diagram` | Clases de secuencias | `nodes`, `edges`, `version`, `linkedSequenceDiagramIds` y origen opcional. |

### 1.1. Envoltorio del archivo individual

| Campo raíz | Tipo | Uso |
| --- | --- | --- |
| `type` | string | Uno de los cinco valores de la tabla anterior. |
| `name` | string | Nombre descriptivo, no vacío; entre 1 y 120 caracteres. |
| `content` | object | La estructura del tipo elegido. Incluí sus arreglos, aunque estén vacíos. |
| `id` | string opcional | ID del artefacto. Requerido para referenciarlo desde otros artefactos de un proyecto. |
| `createdAt`, `updatedAt` | string opcional | Fechas ISO 8601; se completan al normalizar si faltan. |
| `notebook` | object opcional | Apuntes privados del usuario (dudas, textos y bocetos). No forma parte del modelo y la IA no tiene que generarlo; si viene, se conserva tal cual. |

Guardá el JSON en un archivo `.json`. En el destino, usá **Nuevo artefacto → Importar artefacto…** o **Opciones del proyecto → Importar artefacto…**. El archivo puede ser un artefacto individual o un proyecto exportado del que elegir un artefacto. Se agrega una copia con un ID nuevo; los existentes permanecen en el proyecto.

**La importación individual desvincula las referencias a otros artefactos**, aunque sus IDs coincidan con alguno del destino. Mantiene el contenido, los textos y las referencias internas del diagrama. Para conservar vínculos entre varios artefactos, importá el proyecto completo desde **Inicio → Importar…**. No uses un artefacto individual como si fuera un proyecto.

### 1.2. IDs y coordenadas

- Usá IDs no vacíos, sin espacios iniciales/finales y únicos dentro de cada dominio de referencias. Preferí IDs únicos en todo el proyecto para artefactos, clases, métodos, pasos, participantes, mensajes, fragmentos, operandos y notas. Los IDs distinguen mayúsculas y minúsculas.
- Una referencia apunta a un `id`, no a un nombre ni a la posición en un arreglo. Diferenciá el ID de un artefacto, el de un nodo de clase, el de una operación y el de un participante: representan objetos diferentes.
- Los números de coordenadas y tamaños son números JSON finitos, no strings. No generes `NaN`, `Infinity`, `undefined` ni valores de JavaScript.
- En clases y casos de uso, `position.x/y` es la esquina superior izquierda del nodo. En secuencias, `participant.x` es el centro horizontal de su línea de vida. La posición de una nota es su esquina superior izquierda.
- En clases y casos de uso, planificá las posiciones: importar no aplica una distribución global. En secuencias, el orden temporal y la mayor parte del espaciado vertical se calculan desde `items`. En flujos, el orden está en los arreglos y en los números escritos en sus celdas.
- No escribas callbacks `on…`, estado de selección, `dragging`, mediciones temporales, SVG, obstáculos calculados o estado de cámara. Las opciones de tema y del editor no son campos del artefacto.

## 2. Diagrama de clases (`class-diagram`)

`content` contiene `nodes` y `edges`. Identificá clases, responsabilidades, atributos, operaciones y relaciones antes de decidir las coordenadas. La aplicación mide los nodos y enruta las líneas, pero no corrige automáticamente una disposición ilegible al importar.

### 2.1. Clases: `content.nodes`

Cada nodo necesita:

| Campo | Tipo | Uso |
| --- | --- | --- |
| `id` | string | No vacío, único entre los nodos; por ejemplo `"clase-pedido"`. |
| `type` | string | Siempre `"classNode"`. |
| `position` | object | `{ "x": número, "y": número }`; coordenadas finitas del extremo superior izquierdo, en unidades del lienzo. X crece hacia la derecha; Y hacia abajo. |
| `data.name` | string | Nombre de clase en singular, normalmente PascalCase. |
| `data.description` | string opcional | Responsabilidad o aclaración breve; se consulta en el inspector. |
| `data.attributes` | array | Atributos; usar `[]` cuando no corresponda incluirlos. |
| `data.methods` | array | Operaciones; usar `[]` cuando no corresponda incluirlas. |

Un atributo tiene `id`, `name` y `type`, todos strings. Por ejemplo: `{ "id": "pedido-fecha", "name": "fecha", "type": "Date" }`. La aplicación muestra los atributos con `+`; no hay un campo de visibilidad de atributos. No incluyas el signo en `name`.

Un método tiene `id`, `visibility`, `name`, `parameters` y `returnType`, todos strings. `visibility` admite `"+"` (público), `"-"` (privado), `"#"` (protegido) o `""` (sin signo). `name` es solo el nombre; `parameters` es el texto dentro de los paréntesis, por ejemplo `"producto: Producto, cantidad: Integer"`; `returnType` es el tipo devuelto, por ejemplo `"Pedido"` o `"void"`. No escribas la firma completa en `name` ni repitas los paréntesis en `parameters`.

Atributos y métodos aceptan además `"isStatic": true` para los miembros de clase (estáticos), que la aplicación dibuja subrayados como pide UML. Omitilo en los de instancia. Por ejemplo, un Singleton: `{ "id": "config-instancia", "name": "instancia", "type": "Configuracion", "isStatic": true }` y `{ "id": "config-get", "visibility": "+", "name": "getInstancia", "parameters": "", "returnType": "Configuracion", "isStatic": true }`.

Los identificadores de atributos y métodos deben ser únicos dentro de cada lista; preferí identificadores únicos en todo el diagrama para evitar ambigüedades futuras. No agregues espacios al inicio o al final de ningún ID. Las clases se referencian desde las relaciones por `id`, nunca por su nombre.

#### Opciones de presentación y notas

- `data.groupColor`: `"blue"`, `"teal"`, `"green"`, `"amber"`, `"violet"` o `"rose"`. Usá un mismo color para un mismo grupo lógico y conservá el significado UML de las relaciones.
- `data.hideAttributes` y `data.hideMethods`: booleanos; omitilos o usá `false` para un diagrama completo. Ocultan compartimentos, sin borrar su contenido.
- `data.hasParametricValuesNote`: booleano para mostrar una nota de valores paramétricos. No es una marca de clase genérica o abstracta.
- `data.parametricValues`: arreglo de objetos `{ "id": "valor-estado", "value": "PENDIENTE | CONFIRMADO | CANCELADO" }`.
- `data.parametricValuesNoteConnectionMode`: `"automatic"` o `"manual"`. Para una ubicación precisa, usá `"manual"`, `data.parametricValuesNotePosition: { "x": ..., "y": ... }`, y los campos `parametricValuesNoteHandle` / `parametricValuesNoteTargetHandle` con `"top"`, `"right"`, `"bottom"` o `"left"`. Reservá también espacio para la nota.

No hay campos específicos de clase abstracta, interfaz, enumeración, paquete, atributo estático ni restricciones UML arbitrarias. Podés describir esos conceptos en `description`; un campo inventado no agrega su representación visual. No generes callbacks `on…`, estados de selección, `dragging`, dimensiones medidas, `positionAbsolute` ni datos internos de React Flow.

### 2.2. Relaciones: `content.edges`

Cada relación tiene `id` único, `type: "association"`, `source` y `target` con IDs de clases existentes, y un objeto `data`. El campo externo `type` es siempre `"association"`, también para herencia, composición o dependencia; el significado UML se define con `data.relationType`.

Una autorrelación (por ejemplo, la de un Singleton consigo mismo, o un `Empleado` que es jefe de otros `Empleado`) usa el mismo ID en `source` y `target`. Se dibuja como un lazo sobre una esquina de la clase; con `sourceSide` y `targetSide` en lados vecinos (por ejemplo `"right"` y `"top"`) elegís la esquina.

| Campo de `data` | Valores / significado |
| --- | --- |
| `relationType` | `"association"`, `"generalization"`, `"aggregation"`, `"composition"`, `"dependency"` o `"realization"`. |
| `name` | Nombre breve de la relación, o `""`. |
| `sourceMultiplicity` | Multiplicidad junto a la clase `source`, como `"1"`, `"0..1"`, `"*"`, `"0..*"` o `"1..*"`. Es un string. |
| `targetMultiplicity` | Multiplicidad junto a la clase `target`. En Cliente → Pedido: `sourceMultiplicity: "1"` y `targetMultiplicity: "0..*"` significa que cada pedido tiene un cliente y cada cliente puede tener varios pedidos. |
| `sourceRole`, `targetRole` | Roles de los extremos correspondientes, o `""`; por ejemplo `"cliente"` y `"pedidos"`. |
| `navigability` | `"source-to-target"`, `"target-to-source"`, `"bidirectional"` o `"none"`. |
| `diamondEnd` | `"source"` o `"target"`; extremo del rombo para agregación/composición. |
| `triangleEnd` | `"source"` o `"target"`; extremo del triángulo (la superclase) en una generalización. Si falta, vale `"target"`. |
| `lineStyle` | `"straight"` (Recto) u `"orthogonal"` (Con codos, valor predeterminado). |
| `sourceSide`, `targetSide` | `"automatic"`, `"top"`, `"right"`, `"bottom"` o `"left"`. |
| `labelOffset` | Opcional: `{ "x": número, "y": número }`; desplazamiento de la etiqueta central respecto del recorrido. |

Escribí explícitamente `navigability: "source-to-target"` para asociaciones navegables de origen a destino. Esa es la opción inicial al dibujar una asociación nueva en la aplicación, pero **en un JSON importado la omisión de `navigability` se normaliza a `"none"`**. El inspector permite cambiarla después.

#### Convenciones UML que debe respetar la IA

- **Asociación:** usá el origen como el objeto que conoce al destino. Multiplicidades y roles deben expresar reglas del dominio, sin deducirlas de dónde está dibujada la clase.
- **Generalización:** usá `source` como subclase, `target` como superclase y `triangleEnd: "target"` para colocar el triángulo en la superclase. Es el valor predeterminado, pero conviene escribirlo explícitamente. Normalmente dejá nombre, roles y multiplicidades vacíos.
- **Composición / agregación:** usá `source` como el todo, `target` como la parte y `diamondEnd: "source"`. La composición requiere una relación de pertenencia y ciclo de vida que justifique el rombo lleno; no la uses solo para expresar que una clase utiliza otra.
- **Dependencia:** `source` depende de `target`; la flecha discontinua apunta al destino.
- **Realización:** `source` implementa lo especificado por `target`; el triángulo discontinuo apunta al destino.

La navegabilidad configurable se dibuja para `relationType: "association"`. Para las otras relaciones, la representación depende de su tipo y de `diamondEnd` o `triangleEnd` cuando corresponda. No agregues multiplicidades a herencia, dependencia o realización para intentar mostrarlas como una asociación.

#### Puertos: dónde se engancha cada línea

Cada clase tiene **12 puertos**, tres por lado, al 20 %, 50 % y 80 % de ese lado. `sourceHandle` y `targetHandle` (campos de la relación, fuera de `data`) eligen uno: `"top"`, `"right"`, `"bottom"`, `"left"` (centro del lado) o esos nombres con `"-start"` / `"-end"`. En los lados superior e inferior, `-start` es el puerto de la izquierda y `-end` el de la derecha; en los lados izquierdo y derecho, `-start` es el de arriba y `-end` el de abajo.

Con una clase en `(x, y)` de ancho `W` y alto `H`, los puertos quedan exactamente en:

| Puerto | Coordenada |
| --- | --- |
| `top-start`, `top`, `top-end` | `(x + 0,2·W, y)`, `(x + 0,5·W, y)`, `(x + 0,8·W, y)` |
| `bottom-start`, `bottom`, `bottom-end` | `(x + 0,2·W, y + H)`, `(x + 0,5·W, y + H)`, `(x + 0,8·W, y + H)` |
| `left-start`, `left`, `left-end` | `(x, y + 0,2·H)`, `(x, y + 0,5·H)`, `(x, y + 0,8·H)` |
| `right-start`, `right`, `right-end` | `(x + W, y + 0,2·H)`, `(x + W, y + 0,5·H)`, `(x + W, y + 0,8·H)` |

- **Lado fijo** (`sourceSide` / `targetSide` = `"top"`, `"right"`, `"bottom"` o `"left"`): la línea sale de ese lado. Si el handle es un puerto de ese mismo lado (`"right-start"` con `sourceSide: "right"`), se respeta; si no, se usa el centro del lado.
- **Lado `"automatic"` con handle**: se usa el handle tal cual.
- **Lado `"automatic"` sin handle**: la aplicación elige el lado que mira a la otra clase y, sobre ese lado, el puerto más cercano a ella. Es la opción segura para relaciones diagonales.
- Nunca dejes dos relaciones en el **mismo puerto** de una clase: las flechas y las multiplicidades se pisan. Si dos relaciones salen por el mismo lado, una va al centro y la otra a `-start` o `-end`; tres, por `-start`, centro y `-end`.

#### Recta o con codos

`lineStyle` decide cómo se dibuja el recorrido entre los dos puertos:

- `"straight"` (Recto) traza **un solo segmento** entre los dos puertos. Si están alineados, es una línea recta horizontal o vertical; si no, queda en diagonal.
- `"orthogonal"` (Con codos, el valor por omisión) traza una línea **recta** cuando los dos puertos se enfrentan (derecho con izquierdo, inferior con superior) y difieren en 12 unidades o menos en la otra coordenada. En cualquier otro caso dibuja tramos horizontales y verticales, y rodea las clases que estorban.

Por eso **la recta no depende del estilo, sino de la alineación**: para que una relación entre vecinas sea recta, sus dos puertos deben tener la misma Y (vecinas en la misma fila) o la misma X (vecinas en la misma columna). Centrá cada clase en su fila y en su columna, como se explica abajo, y las relaciones entre vecinas salen rectas.

- Vecinas alineadas: lados fijos enfrentados (`"right"`→`"left"` o `"bottom"`→`"top"`), handles centrales y `lineStyle: "straight"`.
- Clases en diagonal o lejanas: lados `"automatic"`, sin handles (o con un `-start` / `-end` libre) y `lineStyle: "orthogonal"`. Se dibujan como una L o una Z por el pasillo libre entre clases. Nunca uses `"straight"` en ellas: quedaría una diagonal que cruza el diagrama.
- Proyectos anteriores con `"automatic"`, sin estilo o con un valor inválido se normalizan a `"orthogonal"`.
- Usá `waypoints: []` u omití ese campo; el recorrido lo calcula la aplicación. No escribas `markerStart`, `markerEnd`, SVG, `routingObstacles` ni estilos internos: los símbolos UML salen de `data`.

### 2.3. Disposición: cómo pensar el espacio

La aplicación dibuja cada clase en la coordenada que escribas y no reordena nada al importar. Antes de escribir coordenadas, armá el plano completo: tamaño real de cada clase, una grilla, quién va al lado de quién y por qué puerto entra cada relación.

#### Paso 1. Tamaño real de cada clase

Estas medidas son las del dibujo real (con la tipografía de la aplicación):

- **Ancho**: `W = max(220, 65 + 6 × L)`, donde `L` es la cantidad de caracteres de la línea más larga, contando el nombre de la clase, cada atributo como `nombre: Tipo` y cada método como `nombre(parámetros): Tipo`.
- **Alto**, con `a` atributos y `m` métodos:
  - sin métodos: `H = 56 + 21 × max(a, 1)`;
  - con métodos: `H = 71 + 21 × (max(a, 1) + m)`.

Ejemplos medidos: una clase con 2 atributos y ningún método mide 220 × 98; con 3 atributos y 2 métodos, 220 × 176; una con `descripcionDelProductoSeleccionado: String` mide 317 de ancho. Si ocultás compartimentos (`hideAttributes`, `hideMethods`), no los cuentes.

#### Paso 2. Elegí la clase central y sus vecinas

1. Contá cuántas relaciones tiene cada clase. La que tiene más (el «hub», por ejemplo `Pedido`) va en el **centro** del diagrama, no en una esquina.
2. Cada clase tiene **cuatro vecinas directas**: arriba, abajo, izquierda y derecha. Esas relaciones salen rectas, una por lado, por el puerto central. Asigná primero esos cuatro lugares a las relaciones más importantes del hub.
   - Superclases, arriba de sus subclases.
   - El todo de una composición o agregación, a la izquierda o arriba de sus partes.
   - Las asociaciones de colaboración, de izquierda a derecha.
3. Las relaciones que sobran van a clases ubicadas en las **diagonales** (arriba a la izquierda, abajo a la derecha…). Se dibujan con lado automático como una L o una Z por el pasillo, con su propio puerto `-start` o `-end`. Hasta 4 relaciones rectas y 2 a 4 diagonales por clase se leen bien.
4. Si una clase de las vecinas tiene a su vez otra relación, encadenala: ponela al lado de esa vecina, no del hub. Por ejemplo, `Producto` va arriba de `LineaPedido`, no conectada al hub.
5. Si una clase supera las 8 relaciones, es una señal de diseño. Revisá si todas son necesarias (por ejemplo, un DTO o una pantalla no se asocian con todas las entidades), o acordá dividir el modelo en dos diagramas.

**Nunca hagas que todas las relaciones lleguen a una misma clase por el mismo lado ni por el mismo puerto.** Esa es la causa principal de los diagramas ilegibles: líneas superpuestas, multiplicidades encimadas y flechas que no se distinguen.

#### Paso 3. Grilla de filas y columnas

1. Ubicá las clases en una grilla. El **ancho de cada columna** es el de su clase más ancha y el **alto de cada fila**, el de su clase más alta.
2. Entre columnas dejá un **pasillo de 160 a 180** unidades libres (de borde a borde) y entre filas, **110 a 140**. Por esos pasillos pasan las relaciones diagonales y se escriben las multiplicidades y los nombres. Si una relación tiene nombre y roles largos, ensanchá ese pasillo.
3. **Centrá cada clase en su columna y en su fila**: todas las clases de una columna comparten el mismo centro X y todas las de una fila, el mismo centro Y. Así las relaciones entre vecinas son rectas.
   - Centro de columna `cx`: `position.x = cx − W / 2`.
   - Centro de fila `cy`: `position.y = cy − H / 2`.
   - Si `W` o `H` es impar, redondeá la posición al entero más cercano: el margen de 12 unidades absorbe la diferencia.
4. La primera columna puede empezar en `x = 100` y la primera fila en `y = 100`.

#### Paso 4. Escribí cada relación con sus puertos

- Vecinas en la misma fila: `sourceSide: "right"`, `targetSide: "left"` (o al revés), `sourceHandle: "right"`, `targetHandle: "left"`, `lineStyle: "straight"`.
- Vecinas en la misma columna: `"bottom"` → `"top"` (o al revés), con los mismos handles y `lineStyle: "straight"`.
- Diagonales y lejanas: `sourceSide` y `targetSide` en `"automatic"`, sin handles, `lineStyle: "orthogonal"`. Si dos diagonales salen por el mismo lado del hub, dales handles distintos (`-start` y `-end`).
- Una autorrelación usa `sourceSide` y `targetSide` en lados vecinos (`"right"` y `"top"`): el lazo rodea esa esquina. Dejá libre esa esquina.

#### Paso 5. Verificá antes de entregar

1. Ningún par de rectángulos (con el tamaño del paso 1) se toca ni invade el pasillo mínimo.
2. Cada relación recta une dos clases vecinas alineadas, y entre ellas no hay otra clase.
3. Ninguna clase recibe dos relaciones en el mismo puerto.
4. Las relaciones diagonales tienen un pasillo libre para su L o su Z.
5. No escales todo para que entre en una pantalla: el diagrama se recorre con zoom y desplazamiento. Priorizá la legibilidad a escala normal.

### 2.4. Ejemplo completo e importable

Ejemplo con una clase central de 7 relaciones. La grilla tiene tres columnas de 220 de ancho centradas en X = 210, 610 y 1010 (pasillos de 180) y tres filas centradas en Y = 150, 430 y 700 (pasillos de 110 o más).

- `Pedido` (220 × 176) está en el centro.
- Sus cuatro vecinas directas son `Cliente` (izquierda), `LineaPedido` (derecha, composición), `Sucursal` (arriba) y `Pago` (abajo): relaciones rectas, con lados fijos y handles centrales.
- `Producto` se encadena arriba de `LineaPedido`, no del hub.
- `Vendedor` y `Envio` están en diagonales: lados automáticos y `lineStyle: "orthogonal"`, dibujadas como una Z por los pasillos.

```json
{
  "type": "class-diagram",
  "name": "Pedidos y productos",
  "content": {
    "nodes": [
      {
        "id": "clase-vendedor",
        "type": "classNode",
        "position": {
          "x": 100,
          "y": 101
        },
        "data": {
          "name": "Vendedor",
          "description": "Empleado que toma el pedido.",
          "groupColor": "amber",
          "attributes": [
            {
              "id": "vendedor-nombre",
              "name": "nombre",
              "type": "String"
            },
            {
              "id": "vendedor-legajo",
              "name": "legajo",
              "type": "Integer"
            }
          ],
          "methods": []
        }
      },
      {
        "id": "clase-sucursal",
        "type": "classNode",
        "position": {
          "x": 500,
          "y": 101
        },
        "data": {
          "name": "Sucursal",
          "description": "Sucursal que despacha el pedido.",
          "groupColor": "amber",
          "attributes": [
            {
              "id": "sucursal-nombre",
              "name": "nombre",
              "type": "String"
            },
            {
              "id": "sucursal-direccion",
              "name": "direccion",
              "type": "String"
            }
          ],
          "methods": []
        }
      },
      {
        "id": "clase-producto",
        "type": "classNode",
        "position": {
          "x": 900,
          "y": 83
        },
        "data": {
          "name": "Producto",
          "description": "Producto del catálogo; puede aparecer en muchas líneas de pedido.",
          "groupColor": "green",
          "attributes": [
            {
              "id": "producto-nombre",
              "name": "nombre",
              "type": "String"
            },
            {
              "id": "producto-precio",
              "name": "precio",
              "type": "Decimal"
            }
          ],
          "methods": [
            {
              "id": "producto-precio-actual",
              "visibility": "+",
              "name": "precioActual",
              "parameters": "",
              "returnType": "Decimal"
            }
          ]
        }
      },
      {
        "id": "clase-cliente",
        "type": "classNode",
        "position": {
          "x": 100,
          "y": 363
        },
        "data": {
          "name": "Cliente",
          "description": "Cliente que realiza pedidos.",
          "groupColor": "blue",
          "attributes": [
            {
              "id": "cliente-nombre",
              "name": "nombre",
              "type": "String"
            },
            {
              "id": "cliente-email",
              "name": "email",
              "type": "String"
            }
          ],
          "methods": [
            {
              "id": "cliente-crear-pedido",
              "visibility": "+",
              "name": "crearPedido",
              "parameters": "",
              "returnType": "Pedido"
            }
          ]
        }
      },
      {
        "id": "clase-pedido",
        "type": "classNode",
        "position": {
          "x": 500,
          "y": 342
        },
        "data": {
          "name": "Pedido",
          "description": "Pedido con al menos una línea de producto.",
          "groupColor": "teal",
          "attributes": [
            {
              "id": "pedido-numero",
              "name": "numero",
              "type": "String"
            },
            {
              "id": "pedido-fecha",
              "name": "fecha",
              "type": "Date"
            },
            {
              "id": "pedido-estado",
              "name": "estado",
              "type": "String"
            }
          ],
          "methods": [
            {
              "id": "pedido-confirmar",
              "visibility": "+",
              "name": "confirmar",
              "parameters": "",
              "returnType": "void"
            },
            {
              "id": "pedido-cancelar",
              "visibility": "+",
              "name": "cancelar",
              "parameters": "",
              "returnType": "void"
            }
          ]
        }
      },
      {
        "id": "clase-linea-pedido",
        "type": "classNode",
        "position": {
          "x": 900,
          "y": 363
        },
        "data": {
          "name": "LineaPedido",
          "description": "Parte del pedido: cantidad y precio acordado de un producto.",
          "groupColor": "teal",
          "attributes": [
            {
              "id": "linea-cantidad",
              "name": "cantidad",
              "type": "Integer"
            },
            {
              "id": "linea-preciounitario",
              "name": "precioUnitario",
              "type": "Decimal"
            }
          ],
          "methods": [
            {
              "id": "linea-subtotal",
              "visibility": "+",
              "name": "subtotal",
              "parameters": "",
              "returnType": "Decimal"
            }
          ]
        }
      },
      {
        "id": "clase-pago",
        "type": "classNode",
        "position": {
          "x": 500,
          "y": 651
        },
        "data": {
          "name": "Pago",
          "description": "Pago registrado para el pedido.",
          "groupColor": "violet",
          "attributes": [
            {
              "id": "pago-monto",
              "name": "monto",
              "type": "Decimal"
            },
            {
              "id": "pago-fecha",
              "name": "fecha",
              "type": "Date"
            }
          ],
          "methods": []
        }
      },
      {
        "id": "clase-envio",
        "type": "classNode",
        "position": {
          "x": 900,
          "y": 651
        },
        "data": {
          "name": "Envio",
          "description": "Envío a domicilio del pedido.",
          "groupColor": "violet",
          "attributes": [
            {
              "id": "envio-direccion",
              "name": "direccion",
              "type": "String"
            },
            {
              "id": "envio-fechaestimada",
              "name": "fechaEstimada",
              "type": "Date"
            }
          ],
          "methods": []
        }
      }
    ],
    "edges": [
      {
        "id": "rel-cliente-pedido",
        "type": "association",
        "source": "clase-cliente",
        "target": "clase-pedido",
        "sourceHandle": "right",
        "targetHandle": "left",
        "data": {
          "relationType": "association",
          "navigability": "source-to-target",
          "name": "realiza",
          "sourceMultiplicity": "1",
          "targetMultiplicity": "0..*",
          "sourceRole": "",
          "targetRole": "",
          "sourceSide": "right",
          "targetSide": "left",
          "lineStyle": "straight"
        }
      },
      {
        "id": "rel-pedido-linea",
        "type": "association",
        "source": "clase-pedido",
        "target": "clase-linea-pedido",
        "sourceHandle": "right",
        "targetHandle": "left",
        "data": {
          "relationType": "composition",
          "diamondEnd": "source",
          "navigability": "none",
          "name": "contiene",
          "sourceMultiplicity": "1",
          "targetMultiplicity": "1..*",
          "sourceRole": "",
          "targetRole": "",
          "sourceSide": "right",
          "targetSide": "left",
          "lineStyle": "straight"
        }
      },
      {
        "id": "rel-linea-producto",
        "type": "association",
        "source": "clase-linea-pedido",
        "target": "clase-producto",
        "sourceHandle": "top",
        "targetHandle": "bottom",
        "data": {
          "relationType": "association",
          "navigability": "source-to-target",
          "name": "corresponde a",
          "sourceMultiplicity": "0..*",
          "targetMultiplicity": "1",
          "sourceRole": "",
          "targetRole": "",
          "sourceSide": "top",
          "targetSide": "bottom",
          "lineStyle": "straight"
        }
      },
      {
        "id": "rel-pedido-sucursal",
        "type": "association",
        "source": "clase-pedido",
        "target": "clase-sucursal",
        "sourceHandle": "top",
        "targetHandle": "bottom",
        "data": {
          "relationType": "association",
          "navigability": "source-to-target",
          "name": "se despacha desde",
          "sourceMultiplicity": "0..*",
          "targetMultiplicity": "1",
          "sourceRole": "",
          "targetRole": "",
          "sourceSide": "top",
          "targetSide": "bottom",
          "lineStyle": "straight"
        }
      },
      {
        "id": "rel-pedido-pago",
        "type": "association",
        "source": "clase-pedido",
        "target": "clase-pago",
        "sourceHandle": "bottom",
        "targetHandle": "top",
        "data": {
          "relationType": "association",
          "navigability": "source-to-target",
          "name": "se paga con",
          "sourceMultiplicity": "1",
          "targetMultiplicity": "0..1",
          "sourceRole": "",
          "targetRole": "",
          "sourceSide": "bottom",
          "targetSide": "top",
          "lineStyle": "straight"
        }
      },
      {
        "id": "rel-pedido-vendedor",
        "type": "association",
        "source": "clase-pedido",
        "target": "clase-vendedor",
        "data": {
          "relationType": "association",
          "navigability": "source-to-target",
          "name": "tomado por",
          "sourceMultiplicity": "0..*",
          "targetMultiplicity": "1",
          "sourceRole": "",
          "targetRole": "",
          "sourceSide": "automatic",
          "targetSide": "automatic",
          "lineStyle": "orthogonal"
        }
      },
      {
        "id": "rel-pedido-envio",
        "type": "association",
        "source": "clase-pedido",
        "target": "clase-envio",
        "data": {
          "relationType": "association",
          "navigability": "source-to-target",
          "name": "se entrega con",
          "sourceMultiplicity": "1",
          "targetMultiplicity": "0..1",
          "sourceRole": "",
          "targetRole": "",
          "sourceSide": "automatic",
          "targetSide": "automatic",
          "lineStyle": "orthogonal"
        }
      }
    ]
  },
  "id": "artefacto-clases"
}
```

## 3. Modelo de casos de uso (`use-case-model`)

`content` contiene `nodes` y `edges`, pero sus tipos y datos son distintos de los de clases. Representá objetivos observables del actor con nombres como «Registrar pedido». Un actor es un rol externo; no es una pantalla, una tabla ni un componente interno del sistema.

### 3.1. Nodos y límite del sistema

Cada nodo tiene `id`, `type`, `position: { "x": ..., "y": ... }` y `data: { "kind": ..., "name": ... }`.

| Elemento | `type` | `data.kind` | Presentación |
| --- | --- | --- | --- |
| Actor | `useCaseActor` | `actor` | Figura de actor y nombre. |
| Caso de uso | `useCaseOval` | `use-case` | Óvalo con nombre. |
| Límite del sistema | `systemBoundary` | `system-boundary` | Rectángulo con título. Usá `style: { "width": ..., "height": ... }`. |

Mantené `type` y `kind` coherentes. El límite del sistema se coloca **antes** de los demás nodos en el arreglo para que sea fácil inspeccionar el JSON; el editor lo dibuja detrás de ellos. Sus mínimos visuales son aproximadamente 260 × 180; usá medidas mayores según el contenido.

Los casos de uso se colocan visualmente dentro del límite; los actores, afuera. El contenedor no requiere `parentId`, `parentNode` ni coordenadas relativas: todos los nodos del ejemplo tienen coordenadas absolutas en el lienzo. El límite no recibe relaciones.

### 3.2. Relaciones y dirección UML

Cada edge tiene `id`, `type: "useCaseRelation"`, `source`, `target` y `data`. `data.relationType` admite solo `association`, `include`, `extend` y `generalization`; `data.label` es texto opcional.

| Relación | Origen → destino |
| --- | --- |
| `association` | Actor → caso de uso. Se dibuja una línea sin flecha. |
| `include` | Caso base → caso que se ejecuta obligatoriamente como parte de él. |
| `extend` | Caso que agrega comportamiento opcional/condicional → caso base extendido. |
| `generalization` | Actor especializado → actor general, o caso especializado → caso general. |

Include, extend y generalización apuntan al destino. Las etiquetas «include» y «extend» se generan por el tipo: no escribas esos textos como si definieran el comportamiento de `label`. `sourceHandle` / `targetHandle` pueden ser `top`, `right`, `bottom` o `left`; las líneas actuales se dibujan entre los contornos de las figuras y no necesitan rutas manuales.

No uses `navigability`, `diamondEnd`, `triangleEnd`, multiplicidades ni roles de asociaciones de clases en este artefacto. Evitá duplicar relaciones entre el mismo par de nodos y no conectes un elemento consigo mismo.

### 3.3. Orden y espaciado

- Reservá unos 130 × 150 para un actor y al menos 226 × 112 para un óvalo; nombres largos o de varias líneas necesitan margen adicional.
- Dejá 100–160 unidades libres entre figuras. Colocá los actores a los lados y agrupá objetivos relacionados dentro del sistema, con el caso principal próximo al actor.
- Reservá al menos 60 unidades de margen dentro del contenedor, y una franja superior para su título. Dimensioná el límite después de posicionar los casos de uso.
- Distribuí include/extend en corredores distintos y revisá las etiquetas centrales. Los cruces de líneas no se eliminan solos.
- Verificá que todos los óvalos queden dentro del límite y que todos los actores queden fuera. La contención visual es intencional; no debe contarse como una superposición accidental entre nodos.

### 3.4. Ejemplo completo e importable

La cancelación condicional del ejemplo es un requisito ilustrativo de este dominio. No agregues esa extensión en un sistema que no la necesite.

```json
{
  "id": "artefacto-casos-uso",
  "type": "use-case-model",
  "name": "Casos de uso de pedidos",
  "content": {
    "nodes": [
      {
        "id": "limite-pedidos",
        "type": "systemBoundary",
        "position": {
          "x": 350,
          "y": 100
        },
        "style": {
          "width": 960,
          "height": 620
        },
        "data": {
          "kind": "system-boundary",
          "name": "Sistema de pedidos"
        }
      },
      {
        "id": "actor-comprador",
        "type": "useCaseActor",
        "position": {
          "x": 100,
          "y": 350
        },
        "data": {
          "kind": "actor",
          "name": "Comprador"
        }
      },
      {
        "id": "cu-registrar",
        "type": "useCaseOval",
        "position": {
          "x": 460,
          "y": 350
        },
        "data": {
          "kind": "use-case",
          "name": "Registrar pedido"
        }
      },
      {
        "id": "cu-validar",
        "type": "useCaseOval",
        "position": {
          "x": 1000,
          "y": 210
        },
        "data": {
          "kind": "use-case",
          "name": "Validar pedido"
        }
      },
      {
        "id": "cu-cancelar",
        "type": "useCaseOval",
        "position": {
          "x": 1000,
          "y": 520
        },
        "data": {
          "kind": "use-case",
          "name": "Cancelar pedido"
        }
      }
    ],
    "edges": [
      {
        "id": "rel-comprador-registrar",
        "type": "useCaseRelation",
        "source": "actor-comprador",
        "target": "cu-registrar",
        "sourceHandle": "right",
        "targetHandle": "left",
        "data": {
          "relationType": "association",
          "label": ""
        }
      },
      {
        "id": "rel-registrar-validar",
        "type": "useCaseRelation",
        "source": "cu-registrar",
        "target": "cu-validar",
        "sourceHandle": "right",
        "targetHandle": "left",
        "data": {
          "relationType": "include",
          "label": ""
        }
      },
      {
        "id": "rel-cancelar-registrar",
        "type": "useCaseRelation",
        "source": "cu-cancelar",
        "target": "cu-registrar",
        "sourceHandle": "left",
        "targetHandle": "right",
        "data": {
          "relationType": "extend",
          "label": ""
        }
      }
    ]
  }
}
```

## 4. Flujo de sucesos (`use-case-flow`)

Este artefacto es una especificación textual con camino básico y caminos alternativos. **No tiene `nodes`, `edges`, coordenadas ni carriles de secuencia.**

### 4.1. Descripción y estado

`content.description` incluye todos estos campos string:

| Campo | Significado |
| --- | --- |
| `useCaseNumber` | Identificador legible del caso, por ejemplo `CU 1`; no es un ID de artefacto. |
| `useCaseName` | Objetivo del actor, coherente con el modelo de casos de uso. |
| `actor` | Rol principal que inicia o participa del flujo. |
| `description` | Resumen del objetivo y del resultado. |
| `priority` | Uno de `A`, `B`, `C`, según la prioridad acordada. |
| `inputParameters` | Datos necesarios como texto, no como un arreglo JSON. |
| `precondition`, `postcondition` | Condiciones anteriores y posteriores. |
| `initialState`, `finalState` | Estados del dominio como texto; admiten saltos de línea `\n` y viñetas. |

La vinculación opcional con el modelo de clases es `content.classDiagramArtifactId`, con el ID de un artefacto `class-diagram` del mismo proyecto. Se usa para consultar clases, atributos y operaciones al escribir. Si el campo falta, el editor usa el único diagrama de clases del proyecto; `null` significa «Sin referencia» elegida explícitamente y no se reemplaza. Para un proyecto generado por IA, escribí el vínculo explícito.

No hay un campo que vincule el flujo a un nodo del modelo de casos de uso: la coherencia del caso se establece mediante `useCaseNumber` y `useCaseName`. No inventes `useCaseModelArtifactId`, `useCaseNodeId` ni referencias semejantes.

### 4.2. Camino básico, pasos y alternativas

`content.basicFlow` es un arreglo ordenado de filas. Cada fila tiene cuatro strings: `id`, `actor`, `system` y `ref`.

- `actor` describe la acción del actor; `system`, la respuesta o acción del sistema. Se puede dejar una celda vacía con `""`.
- **La numeración visible está escrita dentro de las celdas**: `"1. El comprador solicita…"`. El ID de fila no la reemplaza y no hay un campo `number` para eso.
- Usá números consecutivos para acciones principales. Para subpasos, escribí `"    2.1. Validar los datos."`: la sangría recomendada es de cuatro espacios por nivel.
- Una fila puede contener varias líneas separadas por `\n`, pero no mezcles varios turnos de actor/sistema en una misma celda. Priorizá una acción clara por paso y viñetas para detalles.
- `ref` es un código de camino alternativo, por ejemplo `"CA 1"`, o `""`. No es una referencia al paso anterior ni un ID de artefacto.
- También podés derivar a una alternativa con `[CA 1]` al final de la línea correspondiente. El código debe coincidir con una alternativa existente. No agregues un camino sin identificar su condición de entrada y su punto de derivación.

`content.alternativeFlows` es un arreglo de objetos con `id`, `code`, `name` y `steps` (filas con el mismo formato). `code` identifica el camino, por ejemplo `"CA 1"`, y debe ser único. `firstStepNumber` es opcional y debe ser un entero positivo: controla el inicio de numeración al editar; los números visibles ya escritos en el JSON deben ser coherentes con él. Si se omite, el editor toma el número principal del punto de derivación y comienza en el siguiente.

### 4.3. Claridad y consistencia

Describí pasos en presente, con sujetos claros, acciones verificables y resultado observable. Diferenciá precondiciones de validaciones realizadas durante el flujo. Cada alternativa debe aclarar si vuelve a un paso existente o si termina el caso. Si mencionás «volver al paso 2», ese paso debe existir en la tabla correspondiente.

No agregues espacios para simular columnas: el editor y la exportación forman las tablas. Usá saltos de línea solo para estructurar el contenido; las celdas se ajustan al texto. Mantené numeración, referencias, nombres de clases y operaciones consistentes con los artefactos vinculados.

### 4.4. Ejemplo completo e importable

```json
{
  "id": "artefacto-flujo",
  "type": "use-case-flow",
  "name": "CU 1 · Registrar pedido",
  "content": {
    "description": {
      "useCaseNumber": "CU 1",
      "useCaseName": "Registrar pedido",
      "actor": "Comprador",
      "description": "El comprador registra un pedido; se confirma si sus datos son válidos o se cancela si son inválidos.",
      "priority": "A",
      "inputParameters": "Datos del cliente y líneas del pedido.",
      "precondition": "El cliente está identificado.",
      "postcondition": "El pedido queda confirmado o cancelado.",
      "initialState": "• Cliente identificado\n• Datos del pedido disponibles",
      "finalState": "• Pedido confirmado, o pedido cancelado con errores informados"
    },
    "basicFlow": [
      {
        "id": "paso-1",
        "actor": "1. El Comprador solicita registrar un pedido.",
        "system": "",
        "ref": ""
      },
      {
        "id": "paso-2",
        "actor": "",
        "system": "2. El sistema crea una instancia de Pedido y valida sus datos. [CA 1]",
        "ref": ""
      },
      {
        "id": "paso-3",
        "actor": "3. El Comprador confirma el pedido.",
        "system": "",
        "ref": ""
      },
      {
        "id": "paso-4",
        "actor": "",
        "system": "4. El sistema confirma el pedido y presenta su número.",
        "ref": ""
      }
    ],
    "alternativeFlows": [
      {
        "id": "alternativo-1",
        "code": "CA 1",
        "name": "Datos del pedido inválidos",
        "firstStepNumber": 3,
        "steps": [
          {
            "id": "ca1-paso-3",
            "actor": "",
            "system": "3. El sistema cancela el pedido, comunica los errores y termina el caso de uso.",
            "ref": ""
          }
        ]
      }
    ]
  }
}
```

## 5. Diagrama de secuencia (`sequence-diagram`)

Una secuencia representa interacciones ordenadas en el tiempo. No usa nodos ni edges de React Flow. Los participantes se identifican por sus propios IDs, distintos de los IDs de clases.

### 5.1. Contenido, opciones y participantes

| Campo de `content` | Tipo / uso |
| --- | --- |
| `version` | Número `1`. |
| `numbering` | `sequential`, `hierarchical` o `none`. La numeración se calcula; no la escribas dentro del nombre del mensaje. |
| `showActivations` | Booleano para mostrar barras de activación. |
| `participantColors` | `automatic` o `disabled`; no admite colores hexadecimales por participante. |
| `spacing` | Opcional: `"compact"` reduce el espacio vertical entre mensajes. Omitilo para el espaciado normal. |
| `classDiagramArtifactId` | Opcional: ID de un artefacto `class-sequence-diagram` del mismo proyecto. No admite un `class-diagram`. Si falta, la secuencia nunca eligió y la aplicación puede vincularla sola al crear o convertir unas Clases de secuencias; `null` significa «Sin vincular» elegido a propósito y no se vincula sola. |
| `participants` | Arreglo de participantes. Planificá sus X y ordenalos de izquierda a derecha. |
| `items` | Arreglo temporal de mensajes y fragmentos. Su orden determina el orden vertical. |
| `activations` | Arreglo de activaciones manuales o guardadas; usá `[]` para inferencia automática. |
| `problems` | Usá `[]`. Los problemas de normalización y semántica los calcula la aplicación; no inventes diagnósticos guardados. |
| `notes` | Arreglo de notas; usá `[]` si no se necesitan. |
| `canvas` | `{ "width": número, "height": número }`; mínimo normalizado 1200 × 900, normalmente 2400 × 1800. El dibujo puede ampliar esos límites para abarcar el contenido. |

Cada participante tiene `id`, `kind`, `name`, `classifierName` y `x`. `kind` admite `actor`, `boundary`, `control`, `entity` u `object`. Para actores, el nombre identifica el rol. Para otros participantes, `name: "cliente"` y `classifierName: "Cliente"` producen el encabezado `cliente : Cliente`. No escribas los dos puntos dentro del nombre de instancia ni inventes un campo `stereotype`.

`x` es el centro de la línea de vida, no la esquina del encabezado. El normalizador acepta centros desde 90 hasta 100000. Un vínculo opcional de clase es `classifierNodeId`, con el ID del nodo dentro del modelo de clases de secuencias asociado, **no el ID del artefacto de clases**. La aplicación vincula por nombre los participantes y las operaciones con las clases y métodos de ese modelo; conserva los vínculos explícitos que siguen siendo válidos.

`createdByMessageId` y `destroyedByMessageId` se recalculan desde los mensajes de creación/destrucción. Para expresar esos eventos, generá mensajes `create` / `destroy`. `terminateLifeline: true` permite terminar una línea de vida sin inventar un mensaje; usalo solo cuando corresponda al escenario.

### 5.2. Mensajes

Cada mensaje incluye `id`, `kind: "message"`, `type`, `sourceId`, `targetId`, `name`, `arguments`, `parameterValues`, `returnType` y `flowReference`. Los campos de texto son strings y pueden ser `""`.

| Campo / valor | Uso |
| --- | --- |
| `type: "synchronous"` | Llamada síncrona. |
| `type: "asynchronous"` | Envío asíncrono, sin tratarlo como una llamada que necesita retorno. |
| `type: "return"` | Respuesta a una llamada previa. Usá `replyToMessageId` con el ID de esa llamada y endpoints invertidos. |
| `type: "create"` | Creación del participante destino. Su encabezado y línea de vida comienzan allí. |
| `type: "destroy"` | Destrucción del destino y final de su línea de vida. |
| `sourceId`, `targetId` | IDs de participantes existentes. Una autollamada puede tener el mismo origen y destino. |
| `name` | Nombre de la operación, por ejemplo `crearPedido`; sin numeración ni firma completa. |
| `arguments` | Texto entre paréntesis, por ejemplo `producto, cantidad`; no agregues los paréntesis. |
| `parameterValues` | Anotación textual opcional de valores, distinta de la lista `arguments`. |
| `returnType` | Tipo devuelto por la llamada, por ejemplo `Pedido` o `void`. |
| `operationMethodId` | Opcional: ID de un método del clasificador del **destinatario**, en el modelo asociado. |
| `replyToMessageId` | Opcional para respuestas: ID de la llamada a la que responden. |
| `flowReference` | Referencia a una fila del flujo asociado, o `""`. Véase sección 7. |

**En mensajes `return`, usá `name`, `arguments`, `parameterValues` y `returnType` vacíos.** El normalizador los limpia; la respuesta se interpreta mediante `replyToMessageId`. No escribas el tipo de la respuesta en el retorno esperando que se conserve: indicá el tipo en la llamada original. Evitá `operationMethodId` en un retorno.

Toda respuesta debe corresponder a una llamada síncrona previa válida en su camino. En este modelador, los mensajes de creación y destrucción no abren llamadas retornables; no les agregues un mensaje `return`. No actives un participante antes de su creación ni lo uses después de destruirlo. En alternativas, una llamada de un operando no se responde desde otro operando. Preferí IDs de respuesta explícitos a depender de inferencia en secuencias anidadas.

### 5.3. Fragmentos combinados y anidamiento

Un fragmento tiene `id`, `kind: "fragment"`, `operator`, `name` y `operands`. Cada operando tiene `id`, `guard` e `items`; esos `items` admiten los mismos mensajes o fragmentos recursivamente.

| `operator` | Intención y operandos |
| --- | --- |
| `alt` | Alternativas; al menos dos operandos, con guardas claras y un `else` cuando corresponda. |
| `opt` | Una interacción opcional; al menos un operando. |
| `loop` | Repetición; al menos un operando, con condición de iteración en la guarda. |
| `par` | Caminos paralelos; al menos dos operandos. |
| `break` | Interrupción del resto de la interacción bajo una condición. |
| `critical` | Región crítica. |
| `ref` | Referencia a otra interacción; `interactionArtifactId` es el ID de otra secuencia del mismo proyecto. |

`guard` contiene solo el texto, por ejemplo `"pedido válido"` o `"else"`. El dibujo agrega los corchetes; no escribas `"[pedido válido]"` si no querés duplicarlos.

`startParticipantId` y `endParticipantId` son opcionales y delimitan el marco con IDs de participantes existentes, ordenados de izquierda a derecha. Omitilos si querés que el marco se calcule desde sus mensajes. Para un fragmento automático, omití `x`, `y`, `width` y `height`: un fragmento manual requiere reservar un área suficiente para todos sus operandos y contenido anidado (mínimos normalizados 140 × 60). No uses un marco manual chico para esconder mensajes o forzar superposiciones.

En un `ref`, conservá el nombre de la interacción referenciada y usá un `interactionArtifactId` válido. No generes referencias recursivas entre diagramas sin una intención del modelo. Un `ref` sin enlace solo es un rótulo pendiente de vincular, no una secuencia embebida automáticamente.

### 5.4. Activaciones y notas

Para activaciones automáticas, dejá `activations: []` y `showActivations: true`. Si necesitás una activación manual, sus campos son: `id`, `participantId`, `startMessageId`, `endMessageId` opcional, `level` (entero de 0 a 12) y `manual: true`. `endScope` opcional puede indicar `{ "fragmentId": ..., "operandId": ... }` para cerrar en el límite de un operando. Todas las referencias deben existir y pertenecer a un camino temporal válido; no uses un número de fila como ID de mensaje.

Una nota tiene `id`, `text`, `width`, `height`, `anchorKind` y, opcionalmente, `x`, `y`, `anchorId` y `color`.

- `anchorKind`: `free`, `message`, `fragment` o `participant`. Para una nota vinculada, `anchorId` debe ser el ID del elemento del tipo indicado. Para una nota libre, omití `anchorId`.
- `color`: `yellow`, `red`, `green` o `blue`. No se aceptan colores arbitrarios.
- **Omití `x` e `y` en las notas ancladas.** Al importar, la aplicación la ubica sola, sin tapar mensajes, marcos ni otras notas:
  - nota de un mensaje: 44 unidades a la derecha de la línea de vida más a la derecha del mensaje, a la altura de su flecha, y por fuera de cualquier fragmento que la tape;
  - nota de un fragmento: a la derecha del marco, a la altura de su pestaña;
  - nota de un participante: al lado de su línea de vida, debajo de los encabezados;
  - nota libre: a la derecha de todo el diagrama.
  
  Si varias notas caerían en el mismo lugar, se apilan hacia abajo.
- Si igual escribís `x` / `y`, son la esquina superior izquierda en el lienzo, también para las notas ancladas: el ancla no convierte las coordenadas en un desplazamiento. Una nota con coordenadas inventadas queda lejos de su mensaje; por eso conviene omitirlas.
- Mínimos normalizados: 120 de ancho y 70 de alto. Una medida habitual es 220 × 110; el alto crece solo si el texto no entra.

### 5.5. Orden y espaciado: cómo queda el dibujo

En una secuencia **no se escriben coordenadas verticales**. La posición de cada mensaje sale solo del orden de `items`; las únicas coordenadas que decidís son las `x` de los participantes (y, si querés, las de las notas). Pensá el diagrama como una tabla: las columnas son los participantes y las filas, los mensajes en orden.

#### Columnas: participantes

1. Ordená los participantes de izquierda a derecha **en el orden en que intervienen por primera vez**: actor, interfaz (boundary), control, expertos y entidades. Así casi todos los mensajes van hacia la derecha y unen columnas vecinas.
2. Los objetos creados durante la interacción van a la derecha de quien los crea, en el orden en que se crean.
3. Ancho del encabezado: `ancho = max(mínimo, 28 + 6,3 × caracteres)`, con mínimo 112 para actores y 160 para el resto. El texto es `nombre : Clasificador` (o `:Clasificador` sin nombre de instancia).
4. Separación entre centros consecutivos: `xSiguiente ≥ xActual + anchoActual / 2 + anchoSiguiente / 2 + 100`, y nunca menos de 180. Con nombres cortos, 300 a 360 entre centros deja aire para las firmas.
5. El primer participante va en `x = 140` (actor) o en `x = 120 + ancho / 2`.

#### Filas: mensajes (espaciado normal)

El dibujo apila los elementos de `items` de arriba hacia abajo:

- **Inicio**: la primera fila empieza en `inicio = max(134, 34 + altoEncabezado + 42)`. Con un actor el encabezado mide 80 y el inicio es 156.
- **Mensaje**: ocupa una fila de 58 de alto (84 si es una autollamada; más si su etiqueta ocupa varias líneas) y su flecha va en el centro de la fila.
- **Fragmento**: pestaña de 26; cada operando con guarda suma 24 (12 sin guarda, o en `loop` / `opt`, cuya condición va en la pestaña); un operando vacío, 42. Después de su último mensaje deja 20 de margen y otros 20 antes del elemento siguiente.

Ejemplo: actor, `m1`, `m2`, `loop` con una autollamada `m3`, y el retorno `r2`. Las flechas quedan en Y = 185, 243, 352 y 463; el `loop` va de 272 a 414.

Con `spacing: "compact"` las filas miden 38 (mensaje de una línea), 68 (autollamada) y 32 (retorno), con la flecha 28 unidades debajo del comienzo de la fila (10 en un retorno).

#### Reglas para que cada mensaje quede donde corresponde

1. **El orden de `items` es el orden del dibujo.** Cada mensaje va inmediatamente después del que lo provoca, y cada retorno, justo después del último mensaje de la llamada que responde.
2. Un mensaje que ocurre bajo una condición o en una repetición va **dentro** del operando de su fragmento, no antes ni después. Lo que sigue al fragmento va después del fragmento, en el mismo nivel.
3. **No escribas `x`, `y`, `width` ni `height` en los fragmentos.** El marco se calcula para abarcar sus mensajes. Una `y` manual corre hacia abajo todo lo que sigue y deja huecos; un marco manual chico deja mensajes afuera.
4. Usá `startParticipantId` / `endParticipantId` solo si el marco tiene que abarcar más participantes que los de sus mensajes.
5. No inventes campos `y`, `order` ni `position` en los mensajes: se ignoran.
6. Evitá mensajes que salten muchas columnas. Si un mensaje une participantes lejanos, revisá el orden de los participantes: probablemente uno de ellos va más cerca.
7. Las notas van ancladas y sin coordenadas, como se indica en 5.4.
8. Verificá la creación/destrucción, las respuestas, los límites de fragmentos y las barras de activación; `problems: []` en el JSON no silencia los problemas que detecta la aplicación.

### 5.6. Ejemplo completo e importable

Incluye creación de Pedido, retornos explícitos, una alternativa con dos operandos y una nota anclada sin coordenadas (la aplicación la ubica junto a su mensaje). Los participantes están separados según 5.5. Los vínculos externos se configuran al reunir los ejemplos en un proyecto, como explica la sección 7.

```json
{
  "id": "artefacto-secuencia",
  "type": "sequence-diagram",
  "name": "Secuencia CU 1 · Registrar pedido",
  "content": {
    "version": 1,
    "numbering": "sequential",
    "showActivations": true,
    "participantColors": "automatic",
    "participants": [
      {
        "id": "part-comprador",
        "kind": "actor",
        "name": "Comprador",
        "classifierName": "",
        "x": 140
      },
      {
        "id": "part-cliente",
        "kind": "entity",
        "name": "cliente",
        "classifierName": "Cliente",
        "x": 500
      },
      {
        "id": "part-pedido",
        "kind": "entity",
        "name": "pedido",
        "classifierName": "Pedido",
        "x": 900
      }
    ],
    "items": [
      {
        "id": "msg-crear-pedido",
        "kind": "message",
        "type": "synchronous",
        "sourceId": "part-comprador",
        "targetId": "part-cliente",
        "name": "crearPedido",
        "arguments": "",
        "parameterValues": "",
        "returnType": "Pedido",
        "flowReference": ""
      },
      {
        "id": "msg-construir-pedido",
        "kind": "message",
        "type": "create",
        "sourceId": "part-cliente",
        "targetId": "part-pedido",
        "name": "Pedido",
        "arguments": "",
        "parameterValues": "",
        "returnType": "",
        "flowReference": ""
      },
      {
        "id": "msg-retorno-pedido",
        "kind": "message",
        "type": "return",
        "sourceId": "part-cliente",
        "targetId": "part-comprador",
        "name": "",
        "arguments": "",
        "parameterValues": "",
        "returnType": "",
        "flowReference": "",
        "replyToMessageId": "msg-crear-pedido"
      },
      {
        "id": "frag-validacion",
        "kind": "fragment",
        "operator": "alt",
        "name": "Validación del pedido",
        "startParticipantId": "part-comprador",
        "endParticipantId": "part-pedido",
        "operands": [
          {
            "id": "operando-valido",
            "guard": "pedido válido",
            "items": [
              {
                "id": "msg-confirmar",
                "kind": "message",
                "type": "synchronous",
                "sourceId": "part-comprador",
                "targetId": "part-pedido",
                "name": "confirmar",
                "arguments": "",
                "parameterValues": "",
                "returnType": "void",
                "flowReference": ""
              },
              {
                "id": "msg-retorno-confirmar",
                "kind": "message",
                "type": "return",
                "sourceId": "part-pedido",
                "targetId": "part-comprador",
                "name": "",
                "arguments": "",
                "parameterValues": "",
                "returnType": "",
                "flowReference": "",
                "replyToMessageId": "msg-confirmar"
              }
            ]
          },
          {
            "id": "operando-invalido",
            "guard": "else",
            "items": [
              {
                "id": "msg-cancelar",
                "kind": "message",
                "type": "synchronous",
                "sourceId": "part-comprador",
                "targetId": "part-pedido",
                "name": "cancelar",
                "arguments": "",
                "parameterValues": "",
                "returnType": "void",
                "flowReference": ""
              },
              {
                "id": "msg-retorno-cancelar",
                "kind": "message",
                "type": "return",
                "sourceId": "part-pedido",
                "targetId": "part-comprador",
                "name": "",
                "arguments": "",
                "parameterValues": "",
                "returnType": "",
                "flowReference": "",
                "replyToMessageId": "msg-cancelar"
              }
            ]
          }
        ]
      }
    ],
    "activations": [],
    "problems": [],
    "notes": [
      {
        "id": "nota-crear",
        "text": "La operación crearPedido devuelve el pedido creado.",
        "width": 260,
        "height": 110,
        "anchorKind": "message",
        "anchorId": "msg-crear-pedido",
        "color": "blue"
      }
    ],
    "canvas": {
      "width": 1800,
      "height": 1200
    }
  }
}
```

## 6. Clases de secuencias (`class-sequence-diagram`)

Este es el quinto tipo de artefacto, distinto de un `class-diagram` y de un `sequence-diagram`. Muestra un modelo de clases que se utiliza al trabajar con secuencias.

`content` incluye **todo el formato de clases de la sección 2**: `nodes`, `edges`, atributos, métodos, relaciones, navegabilidad, colores, notas de valores paramétricos y posiciones. Agrega estos campos:

| Campo | Uso |
| --- | --- |
| `version` | Número `1`. |
| `sourceClassDiagramArtifactId` | Opcional, por compatibilidad: ID del `class-diagram` de origen. No activa sincronización; omitilo en archivos nuevos. |
| `linkedSequenceDiagramIds` | Lista derivada de las secuencias cuyo `content.classDiagramArtifactId` apunta a este modelo. La aplicación la reconcilia; `[]` si ninguna lo usa. |

El modelo de clases de secuencias es independiente del diagrama de clases común: sus nodos, relaciones y cambios no se sincronizan con él. Podés partir de sus clases, pero no necesitás conservar los IDs de un modelo fuente para activar ningún vínculo. **Convertir en clases de secuencias…** cambia el tipo de un diagrama de clases, conserva su contenido y lo vincula con las secuencias que todavía no tienen modelo.

Para que una secuencia use este modelo, su `content.classDiagramArtifactId` debe apuntar al ID del artefacto `class-sequence-diagram`. La aplicación deriva `linkedSequenceDiagramIds` de esos vínculos; no edites esa lista para vincular una secuencia. Los cambios de nombre de clases y métodos se propagan a los participantes y mensajes vinculados de sus secuencias.

Si generás clases a partir de secuencias, omití `sourceClassDiagramArtifactId`. Tomá los clasificadores y las operaciones que recibe cada participante; no deduzcas que todos los mensajes representan asociaciones persistentes, herencias o composiciones. Un actor externo no se convierte en una entidad del dominio solo por ser un participante.

Usá los mismos criterios de espaciado, puertos y símbolos UML que en la sección 2. No uses `participants` o `items` aquí ni un supuesto tipo de nodo «clase de secuencia».

#### Resumen de disposición (detalle en 2.2 y 2.3)

- Tamaño de cada clase: ancho `max(220, 65 + 6 × caracteres de la línea más larga)`. Alto `56 + 21 × max(a, 1)` sin métodos y `71 + 21 × (max(a, 1) + m)` con métodos.
- Grilla de columnas y filas, con pasillos de 160 a 180 entre columnas y de 110 a 140 entre filas. Cada clase va centrada en su columna (`x = cx − W/2`) y en su fila (`y = cy − H/2`).
- La clase con más relaciones va en el centro. Sus cuatro vecinas directas (arriba, abajo, izquierda y derecha) se unen con relaciones rectas: lados fijos enfrentados, handles centrales y `lineStyle: "straight"`.
- Las demás relaciones van a clases en diagonal, con lados `"automatic"`, sin handles y `lineStyle: "orthogonal"`. Las que siguen una cadena (una DTO que contiene otra) van al lado de la clase con la que se relacionan, no del centro.
- Nunca dos relaciones en el mismo puerto de una clase. Nunca todas las relaciones a una misma clase por el mismo lado.

### 6.1. Ejemplo completo e importable

Este ejemplo independiente contiene las clases relevantes de la interacción. La sección 7 explica cómo vincularlo a la secuencia dentro de un proyecto.

```json
{
  "id": "artefacto-clases-secuencias",
  "type": "class-sequence-diagram",
  "name": "Clases de la secuencia de pedidos",
  "content": {
    "version": 1,
    "linkedSequenceDiagramIds": [],
    "nodes": [
      {
        "id": "clase-cliente",
        "type": "classNode",
        "position": {
          "x": 100,
          "y": 120
        },
        "data": {
          "name": "Cliente",
          "description": "Cliente que realiza pedidos.",
          "groupColor": "blue",
          "attributes": [
            {
              "id": "cliente-nombre",
              "name": "nombre",
              "type": "String"
            },
            {
              "id": "cliente-email",
              "name": "email",
              "type": "String"
            }
          ],
          "methods": [
            {
              "id": "cliente-crear-pedido",
              "visibility": "+",
              "name": "crearPedido",
              "parameters": "",
              "returnType": "Pedido"
            }
          ]
        }
      },
      {
        "id": "clase-pedido",
        "type": "classNode",
        "position": {
          "x": 460,
          "y": 100
        },
        "data": {
          "name": "Pedido",
          "description": "Pedido con al menos una línea de producto.",
          "groupColor": "teal",
          "attributes": [
            {
              "id": "pedido-numero",
              "name": "numero",
              "type": "String"
            },
            {
              "id": "pedido-fecha",
              "name": "fecha",
              "type": "Date"
            },
            {
              "id": "pedido-estado",
              "name": "estado",
              "type": "String"
            }
          ],
          "methods": [
            {
              "id": "pedido-confirmar",
              "visibility": "+",
              "name": "confirmar",
              "parameters": "",
              "returnType": "void"
            },
            {
              "id": "pedido-cancelar",
              "visibility": "+",
              "name": "cancelar",
              "parameters": "",
              "returnType": "void"
            }
          ]
        }
      }
    ],
    "edges": [
      {
        "id": "rel-cliente-pedido",
        "type": "association",
        "source": "clase-cliente",
        "target": "clase-pedido",
        "sourceHandle": "right",
        "targetHandle": "left",
        "data": {
          "relationType": "association",
          "navigability": "source-to-target",
          "name": "realiza",
          "sourceMultiplicity": "1",
          "targetMultiplicity": "0..*",
          "sourceRole": "cliente",
          "targetRole": "pedidos",
          "sourceSide": "right",
          "targetSide": "left",
          "lineStyle": "straight"
        }
      }
    ]
  }
}
```

## 7. Proyecto completo y vínculos entre artefactos

### 7.1. Envoltorio de proyecto

Un proyecto tiene `id`, `name`, `artifacts` (arreglo de los objetos completos de las secciones anteriores), `activeArtifactId` opcional y fechas `createdAt` / `updatedAt` opcionales. El `activeArtifactId` debe ser el ID de uno de sus artefactos. **No metas `content` en la raíz de un proyecto con varios artefactos.**

Para generar un proyecto con los cinco ejemplos, reuní sus objetos en `artifacts`, usá `id: "proyecto-pedidos"`, `name: "Pedidos"` y `activeArtifactId: "artefacto-clases"`. Completá los vínculos según las tablas siguientes y guardá el objeto entero como JSON. Desde Inicio, importá ese archivo como proyecto para que los vínculos se conserven.

### 7.2. Referencias a artefactos

| Campo | ID que espera | Valor en el proyecto de ejemplo |
| --- | --- | --- |
| Flujo: `content.classDiagramArtifactId` | Artefacto `class-diagram`, o `null` para «Sin referencia». | `artefacto-clases` |
| Secuencia: `content.classDiagramArtifactId` | Artefacto `class-sequence-diagram`, o `null` para «Sin vincular». | `artefacto-clases-secuencias` |
| Secuencia: `content.flowArtifactId` | Artefacto `use-case-flow`. | `artefacto-flujo` |
| Clases de secuencias: `content.sourceClassDiagramArtifactId` | Origen opcional de tipo `class-diagram`, sin sincronización. | Omitir. |
| Clases de secuencias: `content.linkedSequenceDiagramIds` | Arreglo derivado de los vínculos desde las secuencias. | La aplicación deriva `["artefacto-secuencia"]`. |
| Fragmento `ref`: `interactionArtifactId` | Otra secuencia del mismo proyecto. | Solo escribirlo si se agrega esa otra secuencia. |

En el proyecto vinculado, conservá los `nodes` y `edges` del ejemplo de clases de secuencias y apuntá la secuencia a `artefacto-clases-secuencias`. El diagrama de clases común sigue siendo independiente; no hace falta copiar todo su contenido ni declarar un modelo fuente.

### 7.3. Referencias internas de la secuencia

En el ejemplo, agregá `classifierNodeId: "clase-cliente"` al participante `part-cliente` y `classifierNodeId: "clase-pedido"` a `part-pedido`. El actor `part-comprador` queda sin vínculo de clase.

| Mensaje | `operationMethodId` | `flowReference` |
| --- | --- | --- |
| `msg-crear-pedido` | `cliente-crear-pedido` | `paso-1` |
| `msg-construir-pedido` | Omitir: no se definió una operación de constructor en el modelo. | `paso-2` |
| `msg-confirmar` | `pedido-confirmar` | `paso-4` |
| `msg-cancelar` | `pedido-cancelar` | `ca1-paso-3` |
| Mensajes de retorno | Omitir. | `""` |

**`flowReference` no es necesariamente el número visible del paso.** La aplicación usa el valor no vacío de `ref` de la fila y, si está vacío, usa el `id` de la fila. En estos ejemplos todos los `ref` están vacíos y se usan IDs como `paso-1`. Si una fila tiene `ref: "CA 1"`, su opción de referencia en secuencias es `"CA 1"`. Verificá este detalle al generar un archivo desde un flujo existente.

Los mensajes dentro de un fragmento tienen el mismo formato de referencias; recorré recursivamente sus operandos. No apuntes una operación a un método de otra clase, ni confundas `replyToMessageId` con una referencia al flujo.

### 7.4. Coherencia del proyecto

- El nombre del caso de uso del modelo, `description.useCaseName` del flujo y el escenario de la secuencia deben describir el mismo objetivo cuando se pretende que se correspondan. No existe un vínculo JSON directo entre el óvalo de caso de uso y el flujo.
- Los clasificadores y métodos vinculados deben existir en el modelo de clases de secuencias asociado. Sus referencias usan los IDs internos de ese modelo, aunque las clases del diagrama de clases común tengan otros IDs.
- Todos los IDs de artefactos referidos deben existir en el mismo proyecto y ser del tipo correcto. No copies IDs externos esperando que se resuelvan por nombre.
- Al importar un artefacto individual, estos vínculos se quitan para evitar asociaciones accidentales con un proyecto diferente. Para trasladar un conjunto ya existente, usá **Mover a otro proyecto… → Incluir artefactos vinculados**.

## 8. Verificación antes de entregar

1. El archivo pasa `JSON.parse`; su raíz es un artefacto con `type`, `name` y `content`, o un proyecto con `name` y `artifacts` completos. No es texto Markdown ni un arreglo de ejemplos sin envoltorio.
2. Todos los IDs son válidos y únicos en sus dominios; no hay referencias a nombres, índices ni IDs inexistentes. Los datos de opciones usan exactamente los valores admitidos.
3. En clases, los endpoints, multiplicidades, roles, triángulos y rombos expresan el modelo. Los rectángulos calculados con 2.3 no se tocan, las vecinas están centradas en su fila o columna con relaciones rectas, y ninguna clase recibe dos relaciones en el mismo puerto.
4. En casos de uso, los actores quedan fuera del límite, los óvalos dentro, y include/extend/generalización apuntan al destino adecuado.
5. En flujos, la numeración está en el texto, las alternativas se derivan desde un paso real y las referencias a caminos y pasos existen.
6. En secuencias, los participantes siguen el orden de intervención sin superponerse, los mensajes están en `items` en el orden del escenario y dentro del operando correcto, los fragmentos no tienen geometría manual, las notas ancladas no tienen `x` / `y`, las respuestas se enlazan a llamadas previas y la creación/destrucción es consistente.
7. En clases de secuencias, la estructura de clases es válida, las secuencias apuntan a ese artefacto con `content.classDiagramArtifactId` y `linkedSequenceDiagramIds` coincide con esos vínculos. No se requiere sincronización con el diagrama de clases común.
8. Importá el resultado y verificá su presentación, nombres y referencias en el editor correspondiente. En editores que tienen **Revisar**, corregí los problemas reales detectados; la ausencia de avisos no demuestra que el negocio esté modelado correctamente.
9. Exportá un artefacto o el proyecto como JSON para contrastar el formato real. No presentes como editable un campo que el normalizador elimina o recalcula.

## 9. Exportar, importar y mover

**Opciones del artefacto → Exportar artefacto (JSON)** genera un archivo individual de cualquiera de los cinco tipos. **Opciones del proyecto → Exportar proyecto (JSON)** conserva el conjunto con sus vínculos. Junto a cada uno, **Copiar … (JSON)** copia el mismo contenido al portapapeles, para pegarlo directamente en un chat con la IA.

**Importar artefacto…** agrega una copia al proyecto elegido y abre esa copia. **Inicio → Importar…** agrega proyectos completos. No confundas los dos caminos al entregar varios diagramas vinculados.

**Mover a otro proyecto…** permite elegir el destino e incluir los vinculados. Al moverlos juntos se conservan las referencias válidas y se remapean IDs si se repiten en el destino. Si movés uno solo, se quitan los vínculos que quedan fuera de su proyecto. Si se mueve el último artefacto del origen, allí se crea un diagrama de clases vacío para mantener el proyecto utilizable.
