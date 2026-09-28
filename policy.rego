package authz.user

allowed_funcs := {
    "/v1/functions/submitRsvp",
    "/v1/functions/getRsvpCount",
    "/v1/functions/submitGreeting",
    "/v1/functions/listGreetings",
}

allow if {
    input.subject.auth_type == "anonymous"
    input.cloudbase.resource_type == "functions"
    input.request.path in allowed_funcs
}
