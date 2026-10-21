-- Runs once, when the Postgres volume is first initialised.
-- Creates the isolated database used by the automated API test suite.
CREATE DATABASE playverse_test;
