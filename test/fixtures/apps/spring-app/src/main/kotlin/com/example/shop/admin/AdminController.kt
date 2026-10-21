package com.example.shop.admin

import jakarta.annotation.security.RolesAllowed
import jakarta.validation.constraints.NotBlank
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping(value = ["/api/admin"])
@RolesAllowed("ADMIN")
class AdminController(private val users: UserService) {

    @GetMapping(arrayOf("/stats", "/statistics"))
    fun stats(): Stats = users.stats()

    @PatchMapping("/users/{id}")
    fun rename(@PathVariable id: Long, @RequestBody body: RenameRequest): User = users.rename(id, body.name)

    @PostMapping
    fun invite(@RequestParam("email") email: String): User = users.invite(email)
}

data class RenameRequest(
    @field:NotBlank val name: String,
)
