# ChemEFlow

[English version](README.md)

**ChemEFlow** es una herramienta educativa visual para construir diagramas de flujo, definir ecuaciones, analizar si un modelo está listo para resolverse, solucionar modelos pequeños de ingeniería química y revisar resultados estructurados.

## Demo en línea

[Abrir ChemEFlow en línea](https://imclick-project.github.io/ChemEFlow/)

## Problema

Los estudiantes de ingeniería química suelen utilizar herramientas separadas para elaborar diagramas de flujo, formular ecuaciones, resolver modelos numéricos, programar y analizar resultados. Esta fragmentación puede dificultar la comprensión de:

- de dónde provienen las variables;
- cómo se relacionan las corrientes, las ecuaciones y los resultados;
- si un modelo está completo y puede resolverse;
- por qué un sistema no puede resolverse;
- cómo se obtuvo el resultado final;
- cómo transformar un modelo matemático en código ejecutable.

La programación también puede convertirse en una barrera adicional. Los estudiantes pueden comprender las ecuaciones de ingeniería, pero aun así tener dificultades para organizar variables, construir sistemas numéricos, gestionar dependencias e implementar correctamente el modelo en Python o MATLAB.

## Solución

ChemEFlow aborda estas dificultades al integrar el flujo de modelado visual y matemático en un solo entorno. También permite exportar los modelos resueltos como código reutilizable en Python y MATLAB, creando un puente entre el modelado mediante ecuaciones y la programación.

La aplicación ya incluye una API opcional en Python para el análisis y la solución numérica de modelos. Este backend también proporciona una base para integrar en el futuro librerías científicas de Python destinadas al cálculo de propiedades termodinámicas, la solución de ecuaciones no lineales, el análisis de datos y la visualización gráfica.

ChemEFlow organiza el flujo de trabajo en cuatro pestañas conectadas:

- **Components:** define los componentes químicos utilizados en el modelo.
- **Flowsheet:** crea fuentes, destinos, operaciones unitarias, corrientes y conexiones del proceso.
- **Equations:** declara variables, construye sistemas lineales, define funciones de variables objetivo y analiza dependencias.
- **Results:** presenta variables resueltas y no resueltas, tablas másicas y molares, conversiones de base y opciones de exportación.

## Funciones principales

- Construcción visual de diagramas de flujo.
- Configuración de componentes, corrientes y variables.
- Análisis y solución de sistemas lineales.
- Funciones de variables objetivo.
- Detección de dependencias y ciclos.
- Acciones separadas de **Analyze** y **Solve**.
- Backend opcional en Python con respaldo en JavaScript.
- Guardado y carga de proyectos completos.
- Exportación de resultados a CSV.
- Exportación de código ejecutable en Python.
- Exportación de código ejecutable en MATLAB.

## Flujo de trabajo típico

```text
Components
    ↓
Flowsheet
    ↓
Configuración de variables
    ↓
Bloques de ecuaciones
    ↓
Analyze
    ↓
Solve
    ↓
Resultados y exportación
```

## Ejemplo resuelto

Este repositorio incluirá un ejemplo completo resuelto con:

- instrucciones paso a paso;
- capturas de pantalla del flujo principal;
- el proyecto guardado de ChemEFlow;
- resultados generados en CSV;
- código exportado en Python;
- código exportado en MATLAB.

El ejemplo podrá ejecutarse directamente desde la versión pública de GitHub Pages mediante el solucionador de respaldo en JavaScript. El mismo flujo también podrá ejecutarse localmente con el backend opcional en Python para realizar el análisis y la solución con Python.

Además de este ejemplo completo, se busca que el repositorio crezca como una biblioteca de problemas resueltos de ingeniería química que los usuarios puedan reproducir, modificar y utilizar como referencias de aprendizaje.

Enlaces:

- [Ejemplo resuelto](docs/worked-example.md)
- [Archivos generados](examples/worked-example/)
- [Biblioteca de problemas resueltos](examples/)

Esta documentación permitirá a los usuarios y evaluadores reproducir el flujo completo, desde la construcción del proceso hasta la obtención de resultados numéricos y la exportación de código.

## Arquitectura

```text
┌──────────────────────────────────────────────────────────┐
│                    Frontend de ChemEFlow                  │
│                 React + Vite + React Flow                 │
│                                                          │
│ Components → Flowsheet → Equations → Results             │
└───────────────────────────┬──────────────────────────────┘
                            │ API HTTP cuando está disponible
                            ▼
┌──────────────────────────────────────────────────────────┐
│                 Backend opcional en Python                │
│                    FastAPI + NumPy                        │
│                                                          │
│ Estado · Análisis · Solución de sistemas lineales        │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ├── Actual: cálculos con NumPy
                            │
                            └── Futuro: librerías científicas
                                        de Python para propiedades,
                                        ecuaciones no lineales,
                                        análisis de datos y gráficas

Cuando el backend de Python no está disponible, se utiliza el respaldo en JavaScript.
```

## Tecnologías utilizadas

### Frontend

- React
- Vite
- React Flow / XYFlow
- JavaScript
- HTML
- CSS

### Backend

- Python
- FastAPI
- Uvicorn
- NumPy

### Desarrollo y despliegue

- GitHub
- GitHub Pages
- GitHub Actions
- Anaconda
- Visual Studio Code
- Kiro

## Ejecución en línea y local

La versión pública está desplegada mediante GitHub Pages y se ejecuta directamente en el navegador.

Debido a que GitHub Pages solo aloja archivos estáticos, la versión en línea utiliza el solucionador de respaldo en JavaScript.

La versión local puede conectarse opcionalmente al backend de Python para realizar el análisis y la solución numérica.

## Ejecución local

### Requisitos

- Node.js 20 o posterior
- npm
- Opcional: Python 3.11
- Opcional: Anaconda

### Clonar el repositorio

```bash
git clone https://github.com/IMClick-Project/ChemEFlow.git
cd ChemEFlow
```

### Ejecutar el frontend

```bash
npm install
npm run dev
```

Abre la dirección mostrada por Vite, normalmente:

```text
http://localhost:5173
```

### Ejecutar el backend opcional de Python con Anaconda

```bash
conda create -n chemeflow python=3.11
conda activate chemeflow
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Cuando el punto de entrada del backend sea directamente `main.py`, utiliza:

```bash
python -m uvicorn main:app --reload --port 8000
```

Comprobación del backend:

```text
http://127.0.0.1:8000/health
```

Documentación de la API:

```text
http://127.0.0.1:8000/docs
```

## Compilación de producción

```bash
npm run build
npm run preview
```

Los archivos de producción se generan en:

```text
dist/
```

## Uso de Kiro

Kiro se utilizó desde las primeras etapas del desarrollo de ChemEFlow, comenzando con la idea inicial del proyecto. Ayudó a transformar el concepto en una estructura de aplicación más clara, identificar los módulos principales y establecer una ruta de desarrollo más organizada.

Trabajar con Kiro fue especialmente útil porque el proyecto requirió salir de mi área principal de ingeniería química y avanzar hacia el desarrollo web. Kiro ayudó a proponer estructuras de interfaz, flujos de trabajo y consideraciones de implementación que podrían no haber sido evidentes inicialmente desde una perspectiva de ingeniería química.

Sin embargo, el uso efectivo de Kiro también requirió conocimientos básicos de desarrollo web y de las tecnologías empleadas en el proyecto. Estos conocimientos fueron necesarios para evaluar sus sugerencias, orientar la implementación, identificar supuestos incorrectos y refinar progresivamente la aplicación.

Por lo tanto, Kiro funcionó como asistente de desarrollo y herramienta de apoyo al diseño, mientras que las decisiones técnicas finales, las pruebas, las correcciones y la integración fueron guiadas por los requisitos del proyecto y sus objetivos de ingeniería.

## Despliegue en la nube

El prototipo público actual está desplegado mediante GitHub Pages.

Los servicios de AWS no se integraron en la arquitectura final de esta versión desarrollada para el hackathon.

La aplicación puede ejecutarse completamente en el navegador mediante el respaldo en JavaScript, mientras que el backend opcional con FastAPI y NumPy está disponible para la solución local asistida por Python.

## Importancia de ChemEFlow

ChemEFlow responde a una necesidad educativa real al conectar la estructura del proceso, las ecuaciones, el análisis, la solución, la programación y los resultados en un solo flujo de trabajo.

Su principal contribución no es un nuevo algoritmo numérico ni un simulador de procesos. La contribución consiste en un entorno educativo integrado en el que los usuarios pueden observar:

- cómo se construye el modelo;
- de dónde provienen las variables;
- de qué depende cada ecuación;
- si el modelo puede resolverse;
- cómo se genera el resultado;
- cómo puede exportarse y reutilizarse el modelo.

También funciona como un puente entre el modelado basado en ecuaciones y la programación, al generar implementaciones reutilizables en Python y MATLAB a partir del modelo creado visualmente.

La API de Python existente también proporciona una base práctica para ampliar ChemEFlow con librerías científicas de Python sin tener que rediseñar toda la arquitectura de la aplicación.

## Limitaciones actuales

- ChemEFlow no sustituye a un simulador riguroso de procesos.
- La versión pública de GitHub Pages no puede ejecutar el backend de Python.
- Todavía no se integran paquetes de propiedades termodinámicas.
- La conversión de base requiere información de pesos moleculares.
- El prototipo actual se enfoca en modelos educativos pequeños.
- Todavía no se incluyen modelos avanzados de operaciones unitarias.
- La simulación dinámica permanece como trabajo futuro.

## Trabajo futuro

- Desplegar el backend de Python en un servicio en la nube.
- Ampliar la biblioteca de operaciones unitarias.
- Integrar librerías científicas de Python para calcular propiedades termodinámicas.
- Admitir una mayor variedad de funciones y expresiones matemáticas.
- Ampliar las funciones de variables objetivo con operaciones matemáticas adicionales.
- Incorporar gráficas interactivas de expresiones, relaciones entre variables y resultados calculados.
- Agregar sistemas de ecuaciones no lineales mediante librerías numéricas de Python.
- Incorporar tutoriales guiados y más ejemplos resueltos.
- Mejorar las pruebas automatizadas y la accesibilidad.

## Equipo

**Mariola Camacho Lie (IMClick-Project)** — Creadora del proyecto, desarrollo del concepto de ingeniería química, diseño de la aplicación, pruebas, documentación e integración.

## Video de demostración

El video final del proyecto presentará:

- el problema abordado por ChemEFlow;
- el objetivo de la aplicación;
- sus componentes principales;
- un ejemplo funcional completo;
- el proceso de desarrollo y el uso de Kiro.

**Video:** _Agregar aquí el enlace final antes de la entrega._

## Agradecimientos

Agradezco a Código Facilito por organizar el hackathon y por ofrecer previamente el bootcamp sobre Kiro y AWS.

Los materiales de aprendizaje, las sesiones prácticas, el apoyo de la comunidad y la mentoría contribuyeron a fortalecer el proceso de desarrollo y proporcionaron orientación útil para transformar la idea inicial en un proyecto funcional.

El bootcamp fue especialmente valioso para explorar herramientas y enfoques de desarrollo fuera de mi área principal de ingeniería química, manteniendo al mismo tiempo una evaluación crítica, orientación técnica y pruebas continuas durante la implementación.

## Licencia

## Licencia

ChemEFlow está disponible bajo la
[Licencia de Uso Académico y Científico de ChemEFlow](LICENSE.md).

El software puede utilizarse gratuitamente para docencia, aprendizaje,
investigación académica no comercial y experimentación interna.

El uso académico, científico o educativo deberá reconocer y citar:

**Mariola Camacho Lie, ChemEFlow, 2026.**

Se permite modificar el código para fines personales, educativos o de
investigación interna. La redistribución pública de versiones modificadas
o derivadas, el uso comercial, la reventa o su prestación como servicio
de pago requieren autorización previa por escrito de Mariola Camacho Lie.

El nombre, el logotipo y la identidad visual de ChemEFlow no podrán
utilizarse para presentar versiones modificadas como versiones oficiales.
