<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Thrown when code attempts to UPDATE or DELETE a record that the
 * compliance model treats as append-only — currently the tenant and
 * central audit logs (21 CFR Part 11 §11.10(e)).
 *
 * This is a programming error, not a user error: nothing in the product
 * should ever mutate an audit row, so reaching this exception means a
 * code path needs fixing rather than a nicer error message.
 */
class ImmutableRecordException extends RuntimeException
{
}
