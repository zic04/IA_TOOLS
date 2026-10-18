import { IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  customer: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsIn(['standard', 'express'])
  shipping: string;

  @IsInt()
  @Min(1)
  @Max(9)
  quantity: number;

  @IsNotEmpty()
  readonly reference: string;

  // @IsString()
  notes?: string;
}
