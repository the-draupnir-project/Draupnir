rule TestRule : test_rule
{
    meta:
        Author = "MTRNord"
        Description = "Test Rule"
        hash = "06fdc3d7d60da6b884fd69d7d1fd3c824ec417b2b7cdd40a7bb8c9fb72fb655b"
        Action = "Notify"
    strings:
        $test_string = "Test" ascii nocase

    condition:
        $test_string
}

rule NotifyUserRule : test_rule
{
    meta:
        Author = "MTRNord"
        Description = "NotifyUserRule"
        Action = "Notify"
        NotifcationText = "Please don't"
    strings:
        $test_string = "Notify user" ascii nocase

    condition:
        $test_string
}
