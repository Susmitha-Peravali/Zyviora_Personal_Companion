% main.pl
% Entry point for the Zyviora Prolog knowledge base.
% This file consults all specific capability modules.

:- use_module(library(random)).

% Consult conversation logic
:- consult('conversation.pl').

% Consult emotion and support rules
:- consult('emotion.pl').

% Consult interview prep rules
:- consult('interview.pl').

% Consult productivity rules
:- consult('productivity.pl').

% Consult general knowledge base
:- consult('knowledge.pl').

% Consult decision-making support rules
:- consult('decision_support.pl').

% Consult Wordle game logic
:- consult('wordle_game.pl').

% Fallback catch-all rule pattern for Companion Mode
% If nothing else matches, encourage the user to keep talking.
handle_input(Input, Response) :- respond_emotion(Input, Response), !.
handle_input(Input, Response) :- greet(Input, Response), !.
handle_input(Input, Response) :- productivity_tip(Input, Response), !.
handle_input(Input, Response) :- provide_interview_tip(Input, Response), !.
handle_input(Input, Response) :- fact(Input, Response), !.
handle_input(Input, Response) :- decide_support(Input, Response), !.
handle_input(Input, Response) :- wordle_support(Input, Response), !.

% When Prolog fails to match any pattern, return a special flag 
% to inform Python that it should bounce this to the Google Gemini LLM API
handle_input(_, '[unhandled_intent]').
