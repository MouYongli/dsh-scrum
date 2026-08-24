# Task and Run States

## Draft

The task exists but has not been submitted.

Actions:

- edit;
- start;
- delete.

## Queued

The task is accepted but not running.

Show:

- queue state;
- optional queue position only if reliable;
- cancel action.

## Planning

The Agent is determining steps.

Show:

- planning indicator;
- current context;
- cancel when supported.

## Running

A step is actively executing.

Show:

- current step;
- activity;
- elapsed time;
- tool state;
- pause or cancel when supported.

## Waiting for tool

Execution depends on an external or internal tool.

Show:

- tool;
- requested operation;
- waiting reason;
- timeout or retry information when relevant.

## Waiting for user

The Agent needs user input.

Show:

- exact missing information;
- impact;
- input control;
- resume behavior.

## Waiting for approval

A proposed action requires explicit approval.

Show the complete approval scope.

## Paused

Execution is intentionally paused.

Show:

- reason;
- preserved state;
- resume action;
- cancel action.

## Retrying

A previous attempt failed and a retry is underway or scheduled.

Show:

- failed operation;
- attempt count;
- delay;
- fallback behavior;
- cancel or intervene action.

## Completed

The task finished successfully.

Show:

- result;
- artifacts;
- duration;
- validation summary;
- follow-up actions.

## Completed with warnings

The main task finished, but some checks or optional steps had issues.

Show:

- result;
- warning count;
- affected outputs;
- recommended review.

## Failed

The task cannot continue automatically.

Show:

- failure summary;
- failed step;
- preserved artifacts;
- logs;
- recovery options.

## Cancelled

Execution was stopped.

Show:

- who or what cancelled it;
- partial outputs;
- whether it can be restarted.
